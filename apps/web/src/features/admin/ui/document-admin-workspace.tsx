"use client";

import { upload } from "@vercel/blob/client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createShortId,
  slugify,
} from "@/features/content-management/application/document-paths";
import type { ConvertedDocx } from "@/features/content-management/application/ports/docx-converter";
import type {
  Category,
  DocumentManifest,
  DocumentMetadata,
  DocumentStatus,
  Taxonomy,
  VersionedDocument,
  VersionedTaxonomy,
} from "@/features/content-management/domain/models";
import { MammothDocxConverter } from "@/features/content-management/infrastructure/browser/mammoth-docx-converter";
import { adminRequest } from "@/features/content-management/presentation/admin-api";
import { MarkdownRenderer } from "@/features/markdown-reader/presentation/rendering/markdown-renderer";

const emptyMetadata: DocumentMetadata = {
  title: "",
  summary: "",
  author: "",
  tags: [],
  order: null,
  extra: {},
};

export function DocumentAdminWorkspace() {
  const router = useRouter();
  const [documents, setDocuments] = useState<DocumentManifest[]>([]);
  const [taxonomyState, setTaxonomyState] = useState<VersionedTaxonomy | null>(
    null,
  );
  const [selected, setSelected] = useState<VersionedDocument | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const [documentsResult, taxonomyResult] = await Promise.all([
        adminRequest<{ documents: DocumentManifest[] }>("/api/admin/documents"),
        adminRequest<VersionedTaxonomy>("/api/admin/taxonomy"),
      ]);
      setDocuments(documentsResult.documents);
      setTaxonomyState(taxonomyResult);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function openDocument(id: string) {
    try {
      setSelected(
        await adminRequest<VersionedDocument>(`/api/admin/documents/${id}`),
      );
    } catch (caught) {
      setError(messageOf(caught));
    }
  }

  async function transition(document: DocumentManifest, action: string) {
    if (
      action === "purge" &&
      !window.confirm(
        "Esta acción elimina definitivamente Markdown e imágenes. ¿Continuar?",
      )
    )
      return;
    try {
      const current = await adminRequest<VersionedDocument>(
        `/api/admin/documents/${document.id}`,
      );
      await adminRequest(
        `/api/admin/documents/${document.id}/actions/${action}`,
        {
          method: "POST",
          body: JSON.stringify({ expectedEtag: current.etag }),
        },
      );
      setSelected(null);
      await refresh();
      router.refresh();
    } catch (caught) {
      setError(messageOf(caught));
    }
  }

  async function trash(document: DocumentManifest) {
    if (!window.confirm(`Enviar “${document.metadata.title}” a la papelera?`))
      return;
    try {
      const current = await adminRequest<VersionedDocument>(
        `/api/admin/documents/${document.id}`,
      );
      await adminRequest(`/api/admin/documents/${document.id}`, {
        method: "DELETE",
        body: JSON.stringify({ expectedEtag: current.etag }),
      });
      setSelected(null);
      await refresh();
      router.refresh();
    } catch (caught) {
      setError(messageOf(caught));
    }
  }

  async function logout() {
    await adminRequest("/api/admin/auth/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  const taxonomy = taxonomyState?.taxonomy ?? emptyTaxonomy();

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Vercel Blob es la fuente de verdad de documentos, imágenes y
          clasificación.
        </p>
        <button
          onClick={logout}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          Cerrar sesión
        </button>
      </div>
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive"
        >
          {error}
        </p>
      ) : null}
      <DocxImportPanel
        taxonomy={taxonomy}
        onCreated={(document) => {
          setDocuments((current) => upsertDocument(current, document.manifest));
          router.refresh();
        }}
      />
      {selected ? (
        <DocumentEditor
          key={selected.etag}
          document={selected}
          taxonomy={taxonomy}
          onClose={() => setSelected(null)}
          onSaved={(document) => {
            setSelected(null);
            setDocuments((current) =>
              upsertDocument(current, document.manifest),
            );
            router.refresh();
          }}
        />
      ) : null}
      <DocumentList
        documents={documents}
        loading={loading}
        onEdit={openDocument}
        onTrash={trash}
        onAction={transition}
      />
      {taxonomyState ? (
        <TaxonomyManager
          value={taxonomyState}
          onSaved={(value) => setTaxonomyState(value)}
        />
      ) : null}
    </div>
  );
}

function DocxImportPanel({
  taxonomy,
  onCreated,
}: {
  taxonomy: Taxonomy;
  onCreated: (document: VersionedDocument) => void;
}) {
  const converter = useMemo(() => new MammothDocxConverter(), []);
  const [file, setFile] = useState<File | null>(null);
  const [converted, setConverted] = useState<ConvertedDocx | null>(null);
  const [metadata, setMetadata] = useState<DocumentMetadata>(emptyMetadata);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [extraJson, setExtraJson] = useState("{}");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function selectFile(selected: File | undefined) {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const result = await converter.convert(selected);
      setFile(selected);
      setConverted(result);
      const inferredTitle =
        result.markdown.match(/^#\s+(.+)$/m)?.[1] ??
        selected.name.replace(/\.docx$/i, "");
      setMetadata({ ...emptyMetadata, title: inferredTitle });
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!file || !converted) return;
    setBusy(true);
    setError("");
    try {
      const extra = JSON.parse(extraJson) as DocumentMetadata["extra"];
      const intent = await adminRequest<{
        intentToken: string;
        assets: Array<{ index: number; pathname: string; placeholder: string }>;
      }>("/api/admin/import-intents", {
        method: "POST",
        body: JSON.stringify({
          originalFileName: file.name,
          assets: converted.assets.map((asset) => ({
            index: asset.index,
            sha256: asset.sha256,
            extension: asset.extension,
            contentType: asset.contentType,
          })),
        }),
      });
      const uploaded = await Promise.all(
        converted.assets.map(async (asset) => {
          const target = intent.assets.find(
            (item) => item.index === asset.index,
          );
          if (!target)
            throw new Error("No se reservó una ruta para una imagen.");
          const result = await upload(target.pathname, asset.blob, {
            access: "public",
            handleUploadUrl: "/api/admin/blob/upload",
            clientPayload: intent.intentToken,
          });
          return {
            index: asset.index,
            placeholder: target.placeholder,
            originalName: `image-${asset.index + 1}.${asset.extension}`,
            pathname: result.pathname,
            url: result.url,
            contentType: asset.contentType,
            size: asset.blob.size,
            sha256: asset.sha256,
          };
        }),
      );
      const document = await adminRequest<VersionedDocument>(
        "/api/admin/documents",
        {
          method: "POST",
          body: JSON.stringify({
            intentToken: intent.intentToken,
            originalFileName: file.name,
            markdown: converted.markdown,
            assets: uploaded,
            metadata: { ...metadata, extra },
            categoryId,
            subcategoryId,
          }),
        },
      );
      setFile(null);
      setConverted(null);
      setMetadata(emptyMetadata);
      setExtraJson("{}");
      onCreated(document);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5 rounded-2xl border bg-card p-6">
      <div>
        <h2 className="text-2xl font-semibold">Importar DOCX</h2>
        <p className="text-sm text-muted-foreground">
          El archivo se convierte en este navegador; el DOCX original no se
          sube.
        </p>
      </div>
      <input
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        disabled={busy}
        onChange={(event) => void selectFile(event.target.files?.[0])}
      />
      {busy && !converted ? <p>Convirtiendo documento…</p> : null}
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      {converted ? (
        <div className="space-y-5">
          {converted.warnings.length ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <strong>Advertencias de conversión</strong>
              <ul className="mt-2 list-disc pl-5">
                {converted.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <MetadataFields
            metadata={metadata}
            onChange={setMetadata}
            taxonomy={taxonomy}
            categoryId={categoryId}
            subcategoryId={subcategoryId}
            onCategoryChange={(value) => {
              setCategoryId(value);
              setSubcategoryId(null);
            }}
            onSubcategoryChange={setSubcategoryId}
            extraJson={extraJson}
            onExtraJsonChange={setExtraJson}
          />
          <div className="max-h-[32rem] overflow-auto rounded-xl border bg-background p-5">
            <MarkdownRenderer source={converted.markdown} />
          </div>
          <button
            disabled={busy || !metadata.title.trim()}
            onClick={saveDraft}
            className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60"
          >
            {busy
              ? "Guardando…"
              : `Guardar borrador (${converted.assets.length} imágenes)`}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function DocumentEditor({
  document,
  taxonomy,
  onClose,
  onSaved,
}: {
  document: VersionedDocument;
  taxonomy: Taxonomy;
  onClose: () => void;
  onSaved: (document: VersionedDocument) => void;
}) {
  const [markdown, setMarkdown] = useState(document.markdown);
  const [metadata, setMetadata] = useState(document.manifest.metadata);
  const [categoryId, setCategoryId] = useState(document.manifest.categoryId);
  const [subcategoryId, setSubcategoryId] = useState(
    document.manifest.subcategoryId,
  );
  const [extraJson, setExtraJson] = useState(
    JSON.stringify(document.manifest.metadata.extra, null, 2),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty =
    markdown !== document.markdown ||
    JSON.stringify(metadata) !== JSON.stringify(document.manifest.metadata) ||
    categoryId !== document.manifest.categoryId ||
    subcategoryId !== document.manifest.subcategoryId ||
    extraJson !== JSON.stringify(document.manifest.metadata.extra, null, 2);

  useEffect(() => {
    const listener = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [dirty]);

  async function save() {
    setBusy(true);
    setError("");
    try {
      const updated = await adminRequest<VersionedDocument>(
        `/api/admin/documents/${document.manifest.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            markdown,
            metadata: { ...metadata, extra: JSON.parse(extraJson) },
            categoryId,
            subcategoryId,
            expectedEtag: document.etag,
          }),
        },
      );
      onSaved(updated);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5 rounded-2xl border bg-card p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold">
          Editar {document.manifest.metadata.title}
        </h2>
        <button
          onClick={() => {
            if (!dirty || window.confirm("Descartar cambios sin guardar?"))
              onClose();
          }}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          Cerrar
        </button>
      </div>
      <MetadataFields
        metadata={metadata}
        onChange={setMetadata}
        taxonomy={taxonomy}
        categoryId={categoryId}
        subcategoryId={subcategoryId}
        onCategoryChange={(value) => {
          setCategoryId(value);
          setSubcategoryId(null);
        }}
        onSubcategoryChange={setSubcategoryId}
        extraJson={extraJson}
        onExtraJsonChange={setExtraJson}
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <textarea
          aria-label="Markdown"
          value={markdown}
          onChange={(event) => setMarkdown(event.target.value)}
          className="min-h-[32rem] rounded-xl border bg-background p-4 font-mono text-sm"
        />
        <div className="max-h-[42rem] overflow-auto rounded-xl border bg-background p-5">
          <MarkdownRenderer
            source={markdown}
            baseUrl={document.manifest.markdownUrl}
          />
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      <button
        disabled={busy || !dirty}
        onClick={save}
        className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60"
      >
        {busy ? "Guardando…" : "Guardar cambios"}
      </button>
    </section>
  );
}

function MetadataFields(props: {
  metadata: DocumentMetadata;
  onChange: (value: DocumentMetadata) => void;
  taxonomy: Taxonomy;
  categoryId: string | null;
  subcategoryId: string | null;
  onCategoryChange: (value: string | null) => void;
  onSubcategoryChange: (value: string | null) => void;
  extraJson: string;
  onExtraJsonChange: (value: string) => void;
}) {
  const category = props.taxonomy.categories.find(
    (item) => item.id === props.categoryId,
  );
  const update = <K extends keyof DocumentMetadata>(
    key: K,
    value: DocumentMetadata[K],
  ) => props.onChange({ ...props.metadata, [key]: value });
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Título">
        <input
          required
          value={props.metadata.title}
          onChange={(event) => update("title", event.target.value)}
          className="input"
        />
      </Field>
      <Field label="Autor">
        <input
          value={props.metadata.author}
          onChange={(event) => update("author", event.target.value)}
          className="input"
        />
      </Field>
      <Field label="Resumen">
        <textarea
          value={props.metadata.summary}
          onChange={(event) => update("summary", event.target.value)}
          className="input min-h-20"
        />
      </Field>
      <Field label="Etiquetas (separadas por coma)">
        <input
          value={props.metadata.tags.join(", ")}
          onChange={(event) =>
            update(
              "tags",
              event.target.value
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean),
            )
          }
          className="input"
        />
      </Field>
      <Field label="Categoría">
        <select
          value={props.categoryId ?? ""}
          onChange={(event) =>
            props.onCategoryChange(event.target.value || null)
          }
          className="input"
        >
          <option value="">Sin categoría</option>
          {props.taxonomy.categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Subcategoría">
        <select
          value={props.subcategoryId ?? ""}
          disabled={!category}
          onChange={(event) =>
            props.onSubcategoryChange(event.target.value || null)
          }
          className="input"
        >
          <option value="">Sin subcategoría</option>
          {category?.subcategories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Orden">
        <input
          type="number"
          value={props.metadata.order ?? ""}
          onChange={(event) =>
            update(
              "order",
              event.target.value ? Number(event.target.value) : null,
            )
          }
          className="input"
        />
      </Field>
      <Field label="Metadata adicional (JSON)">
        <textarea
          value={props.extraJson}
          onChange={(event) => props.onExtraJsonChange(event.target.value)}
          className="input min-h-24 font-mono text-xs"
        />
      </Field>
    </div>
  );
}

function DocumentList({
  documents,
  loading,
  onEdit,
  onTrash,
  onAction,
}: {
  documents: DocumentManifest[];
  loading: boolean;
  onEdit: (id: string) => void;
  onTrash: (document: DocumentManifest) => void;
  onAction: (document: DocumentManifest, action: string) => void;
}) {
  const [status, setStatus] = useState<DocumentStatus | "all">("all");
  const [page, setPage] = useState(0);
  const filtered = documents.filter(
    (document) => status === "all" || document.status === status,
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const visible = filtered.slice(page * 10, page * 10 + 10);
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">Documentos</h2>
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as typeof status);
            setPage(0);
          }}
          className="rounded-lg border bg-background px-3 py-2"
        >
          <option value="all">Todos</option>
          <option value="draft">Borradores</option>
          <option value="published">Publicados</option>
          <option value="trashed">Papelera</option>
        </select>
      </div>
      {loading ? <p>Cargando…</p> : null}
      {!loading && !visible.length ? (
        <p className="text-muted-foreground">
          No hay documentos en este estado.
        </p>
      ) : null}
      <div className="space-y-3">
        {visible.map((document) => (
          <article
            key={document.id}
            className="flex flex-col justify-between gap-4 rounded-xl border p-4 sm:flex-row sm:items-center"
          >
            <div>
              <h3 className="font-semibold">{document.metadata.title}</h3>
              <p className="text-sm text-muted-foreground">
                {document.status} ·{" "}
                {new Date(document.updatedAt).toLocaleString()}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => onEdit(document.id)}
                className="button-secondary"
              >
                Editar
              </button>
              {document.status === "draft" ? (
                <button
                  onClick={() => onAction(document, "publish")}
                  className="button-primary"
                >
                  Publicar
                </button>
              ) : null}
              {document.status === "published" ? (
                <button
                  onClick={() => onAction(document, "unpublish")}
                  className="button-secondary"
                >
                  Despublicar
                </button>
              ) : null}
              {document.status !== "trashed" ? (
                <button
                  onClick={() => onTrash(document)}
                  className="button-danger"
                >
                  Papelera
                </button>
              ) : (
                <>
                  <button
                    onClick={() => onAction(document, "restore")}
                    className="button-secondary"
                  >
                    Restaurar
                  </button>
                  <button
                    onClick={() => onAction(document, "purge")}
                    className="button-danger"
                  >
                    Eliminar definitivamente
                  </button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      {pages > 1 ? (
        <div className="flex items-center justify-end gap-3">
          <button
            disabled={page === 0}
            onClick={() => setPage((value) => value - 1)}
            className="button-secondary"
          >
            Anterior
          </button>
          <span className="text-sm">
            {page + 1} / {pages}
          </span>
          <button
            disabled={page + 1 >= pages}
            onClick={() => setPage((value) => value + 1)}
            className="button-secondary"
          >
            Siguiente
          </button>
        </div>
      ) : null}
    </section>
  );
}

function TaxonomyManager({
  value,
  onSaved,
}: {
  value: VersionedTaxonomy;
  onSaved: (value: VersionedTaxonomy) => void;
}) {
  const [taxonomy, setTaxonomy] = useState(value.taxonomy);
  const [error, setError] = useState("");
  const addCategory = () =>
    setTaxonomy({
      ...taxonomy,
      categories: [
        ...taxonomy.categories,
        {
          id: createShortId(),
          slug: `categoria-${taxonomy.categories.length + 1}`,
          name: "Nueva categoría",
          subcategories: [],
        },
      ],
    });
  const updateCategory = (id: string, update: Partial<Category>) =>
    setTaxonomy({
      ...taxonomy,
      categories: taxonomy.categories.map((category) =>
        category.id === id ? { ...category, ...update } : category,
      ),
    });
  async function save() {
    try {
      const normalized = {
        ...taxonomy,
        updatedAt: new Date().toISOString(),
        categories: taxonomy.categories.map((category) => ({
          ...category,
          slug: slugify(category.name),
          subcategories: category.subcategories.map((subcategory) => ({
            ...subcategory,
            slug: slugify(subcategory.name),
          })),
        })),
      };
      const result = await adminRequest<VersionedTaxonomy>(
        "/api/admin/taxonomy",
        {
          method: "PUT",
          body: JSON.stringify({
            taxonomy: normalized,
            expectedEtag: value.etag,
          }),
        },
      );
      setTaxonomy(result.taxonomy);
      onSaved(result);
      setError("");
    } catch (caught) {
      setError(messageOf(caught));
    }
  }
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Categorías</h2>
          <p className="text-sm text-muted-foreground">
            Dos niveles controlados: categoría y subcategoría.
          </p>
        </div>
        <button onClick={addCategory} className="button-secondary">
          Añadir categoría
        </button>
      </div>
      {taxonomy.categories.map((category) => (
        <div key={category.id} className="space-y-3 rounded-xl border p-4">
          <div className="flex gap-2">
            <input
              value={category.name}
              onChange={(event) =>
                updateCategory(category.id, { name: event.target.value })
              }
              className="input flex-1"
            />
            <button
              onClick={() =>
                updateCategory(category.id, {
                  subcategories: [
                    ...category.subcategories,
                    {
                      id: createShortId(),
                      slug: "subcategoria",
                      name: "Nueva subcategoría",
                    },
                  ],
                })
              }
              className="button-secondary"
            >
              Añadir subcategoría
            </button>
            <button
              onClick={() =>
                setTaxonomy({
                  ...taxonomy,
                  categories: taxonomy.categories.filter(
                    (item) => item.id !== category.id,
                  ),
                })
              }
              className="button-danger"
            >
              Eliminar
            </button>
          </div>
          {category.subcategories.map((subcategory) => (
            <div key={subcategory.id} className="ml-6 flex gap-2">
              <input
                value={subcategory.name}
                onChange={(event) =>
                  updateCategory(category.id, {
                    subcategories: category.subcategories.map((item) =>
                      item.id === subcategory.id
                        ? { ...item, name: event.target.value }
                        : item,
                    ),
                  })
                }
                className="input flex-1"
              />
              <button
                onClick={() =>
                  updateCategory(category.id, {
                    subcategories: category.subcategories.filter(
                      (item) => item.id !== subcategory.id,
                    ),
                  })
                }
                className="button-danger"
              >
                Eliminar
              </button>
            </div>
          ))}
        </div>
      ))}
      {error ? <p className="text-destructive">{error}</p> : null}
      <button onClick={save} className="button-primary">
        Guardar taxonomía
      </button>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-2 text-sm font-medium">
      <span className="block">{label}</span>
      {children}
    </label>
  );
}
function emptyTaxonomy(): Taxonomy {
  return {
    schemaVersion: 1,
    categories: [],
    updatedAt: new Date(0).toISOString(),
  };
}
function messageOf(error: unknown) {
  return error instanceof Error
    ? error.message
    : "La operación no pudo completarse.";
}

function upsertDocument(
  documents: DocumentManifest[],
  updated: DocumentManifest,
): DocumentManifest[] {
  return [updated, ...documents.filter((item) => item.id !== updated.id)].sort(
    (left, right) => right.updatedAt.localeCompare(left.updatedAt),
  );
}
