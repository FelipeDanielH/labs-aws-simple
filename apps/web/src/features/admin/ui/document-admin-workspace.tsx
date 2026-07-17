"use client";

import { upload } from "@vercel/blob/client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  injectControlledBase,
  processHtmlContent,
} from "@/features/content-management/application/html-content";

import {
  createShortId,
  slugify,
} from "@/features/content-management/application/document-paths";
import { cleanupRemainingMinutes } from "@/features/content-management/application/document-retention";
import type { ConvertedDocx } from "@/features/content-management/application/ports/docx-converter";
import type {
  Category,
  DocumentCleanupResult,
  DocumentMetadata,
  DocumentStatus,
  Taxonomy,
  VersionedDocument,
  VersionedManifest,
  VersionedTaxonomy,
} from "@/features/content-management/domain/models";
import { MammothDocxConverter } from "@/features/content-management/infrastructure/browser/mammoth-docx-converter";
import {
  companionFiles,
  prepareHtmlContent,
  prepareMarkdownContent,
  type BrowserAsset,
} from "@/features/content-management/infrastructure/browser/direct-content-converter";
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
  const [documents, setDocuments] = useState<VersionedManifest[]>([]);
  const [taxonomyState, setTaxonomyState] = useState<VersionedTaxonomy | null>(
    null,
  );
  const [selected, setSelected] = useState<VersionedDocument | null>(null);
  const [documentCache, setDocumentCache] = useState<
    Record<string, VersionedDocument>
  >({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const [documentsResult, taxonomyResult] = await Promise.all([
        adminRequest<{ documents: VersionedManifest[] }>(
          "/api/admin/documents",
        ),
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

  async function openDocument(document: VersionedManifest) {
    setError("");
    const id = document.manifest.id;
    const cached = documentCache[id];
    if (cached?.etag === document.etag) {
      setSelected(cached);
      return;
    }
    try {
      const loaded = await adminRequest<VersionedDocument>(
        `/api/admin/documents/${id}`,
      );
      setDocumentCache((current) => ({ ...current, [id]: loaded }));
      setSelected(loaded);
    } catch (caught) {
      setError(messageOf(caught));
    }
  }

  async function transition(document: VersionedManifest, action: string) {
    if (action === "cleanup") {
      const remainingMinutes = cleanupRemainingMinutes(
        document.manifest.updatedAt,
      );
      if (remainingMinutes > 0) {
        window.alert(
          `Faltan ${remainingMinutes} minuto${remainingMinutes === 1 ? "" : "s"} para poder limpiar las versiones anteriores.`,
        );
        return;
      }
      if (
        !window.confirm(
          "Se conservarán la versión activa y la inmediatamente anterior. ¿Continuar?",
        )
      )
        return;
    }
    if (
      action === "purge" &&
      !window.confirm(
        "Esta acción elimina definitivamente el contenido y sus recursos. ¿Continuar?",
      )
    )
      return;
    setError("");
    try {
      const url = `/api/admin/documents/${document.manifest.id}/actions/${action}`;
      if (action === "cleanup") {
        const result = await adminRequest<DocumentCleanupResult>(url, {
          method: "POST",
          body: JSON.stringify({ expectedEtag: document.etag }),
        });
        window.alert(
          result.deletedFiles
            ? `Se eliminaron ${result.deletedFiles} archivo${result.deletedFiles === 1 ? "" : "s"} (${formatBytes(result.deletedBytes)}).`
            : "No había versiones antiguas para eliminar.",
        );
      } else if (action === "purge") {
        await adminRequest(url, { method: "POST" });
        setDocuments((current) =>
          current.filter((item) => item.manifest.id !== document.manifest.id),
        );
        setDocumentCache((current) => {
          const next = { ...current };
          delete next[document.manifest.id];
          return next;
        });
      } else {
        const updated = await adminRequest<VersionedManifest>(url, {
          method: "POST",
          body: JSON.stringify({ expectedEtag: document.etag }),
        });
        setDocuments((current) => upsertDocument(current, updated));
        setDocumentCache((current) => {
          const cached = current[document.manifest.id];
          return cached
            ? {
                ...current,
                [document.manifest.id]: { ...cached, ...updated },
              }
            : current;
        });
      }
      setSelected(null);
      router.refresh();
    } catch (caught) {
      setError(messageOf(caught));
    }
  }

  async function trash(document: VersionedManifest) {
    if (
      !window.confirm(
        `Enviar “${document.manifest.metadata.title}” a la papelera?`,
      )
    )
      return;
    setError("");
    try {
      const updated = await adminRequest<VersionedManifest>(
        `/api/admin/documents/${document.manifest.id}`,
        {
          method: "DELETE",
          body: JSON.stringify({ expectedEtag: document.etag }),
        },
      );
      setSelected(null);
      setDocuments((current) => upsertDocument(current, updated));
      setDocumentCache((current) => {
        const cached = current[document.manifest.id];
        return cached
          ? {
              ...current,
              [document.manifest.id]: { ...cached, ...updated },
            }
          : current;
      });
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
      <ContentImportPanel
        taxonomy={taxonomy}
        onCreated={(document) => {
          setDocuments((current) => upsertDocument(current, document));
          setDocumentCache((current) => ({
            ...current,
            [document.manifest.id]: document,
          }));
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
            setDocuments((current) => upsertDocument(current, document));
            setDocumentCache((current) => ({
              ...current,
              [document.manifest.id]: document,
            }));
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

function ContentImportPanel(props: {
  taxonomy: Taxonomy;
  onCreated: (document: VersionedDocument) => void;
}) {
  const [tab, setTab] = useState<"docx" | "markdown" | "html">("docx");
  return (
    <section className="space-y-5 rounded-2xl border bg-card p-6">
      <div>
        <h2 className="text-2xl font-semibold">Publicar contenido</h2>
        <p className="text-sm text-muted-foreground">
          DOCX, HTML o Markdown. Todo contenido nuevo comienza como borrador.
        </p>
      </div>
      <div
        role="tablist"
        aria-label="Tipo de contenido"
        className="flex flex-wrap gap-2"
      >
        {(["docx", "markdown", "html"] as const).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={tab === value ? "button-primary" : "button-secondary"}
          >
            {value === "docx"
              ? "DOCX"
              : value === "markdown"
                ? "Markdown"
                : "HTML"}
          </button>
        ))}
      </div>
      {tab === "docx" ? <DocxImportPanel {...props} /> : null}
      {tab === "markdown" ? (
        <DirectImportPanel {...props} kind="markdown" />
      ) : null}
      {tab === "html" ? <DirectImportPanel {...props} kind="html" /> : null}
    </section>
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
  const [markdownSource, setMarkdownSource] = useState("");
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
      setMarkdownSource(result.markdown);
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
        assets: Array<{
          index: number;
          pathname: string;
          relativePath: string;
          placeholder: string | null;
        }>;
      }>("/api/admin/import-intents", {
        method: "POST",
        body: JSON.stringify({
          kind: "docx",
          originalFileName: file.name,
          assets: converted.assets.map((asset) => ({
            index: asset.index,
            sha256: asset.sha256,
            extension: asset.extension,
            contentType: asset.contentType,
            relativePath: `image-${asset.index + 1}.${asset.extension}`,
            size: asset.blob.size,
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
            relativePath: `images/${target.pathname.split("/").at(-1)}`,
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
            contentKind: "docx",
            source: markdownSource,
            assets: uploaded,
            metadata: { ...metadata, extra },
            categoryId,
            subcategoryId,
          }),
        },
      );
      setFile(null);
      setConverted(null);
      setMarkdownSource("");
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
    <div className="space-y-5">
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
          <div className="grid gap-5 lg:grid-cols-2">
            <textarea
              aria-label="Contenido Markdown"
              value={markdownSource}
              onChange={(event) => setMarkdownSource(event.target.value)}
              className="min-h-[32rem] rounded-xl border bg-background p-4 font-mono text-sm"
            />
            <div className="max-h-[42rem] overflow-auto rounded-xl border bg-background p-5">
              <MarkdownRenderer source={markdownSource} />
            </div>
          </div>
          <button
            disabled={busy || !metadata.title.trim() || !markdownSource.trim()}
            onClick={saveDraft}
            className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60"
          >
            {busy
              ? "Guardando…"
              : `Guardar borrador (${converted.assets.length} imágenes)`}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function DirectImportPanel({
  kind,
  taxonomy,
  onCreated,
}: {
  kind: "markdown" | "html";
  taxonomy: Taxonomy;
  onCreated: (document: VersionedDocument) => void;
}) {
  const [source, setSource] = useState("");
  const [fileName, setFileName] = useState(
    kind === "markdown" ? "nuevo.md" : "documento.html",
  );
  const [assetFiles, setAssetFiles] = useState<File[]>([]);
  const [metadata, setMetadata] = useState<DocumentMetadata>(emptyMetadata);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [extraJson, setExtraJson] = useState("{}");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function prepare(currentSource = source, currentFiles = assetFiles) {
    return kind === "html"
      ? prepareHtmlContent(currentSource, fileName, currentFiles)
      : prepareMarkdownContent(currentSource, fileName, currentFiles);
  }

  async function loadMainFile(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
      setFileName(file.name);
      setSource(text);
      const result =
        kind === "html"
          ? await prepareHtmlContent(text, file.name, assetFiles)
          : await prepareMarkdownContent(text, file.name, assetFiles);
      setSource(result.source);
      setWarnings(result.warnings);
      setMetadata((current) => ({
        ...current,
        ...result.metadata,
        title: result.metadata.title ?? result.title,
      }));
      if (result.metadata.extra) {
        setExtraJson(JSON.stringify(result.metadata.extra, null, 2));
      }
    } catch (caught) {
      setError(messageOf(caught));
      setMetadata((current) => ({
        ...current,
        title: current.title || file.name.replace(/\.(?:md|html)$/i, ""),
      }));
    }
  }

  async function selectAssets(files: FileList | null) {
    const selected = companionFiles(files);
    setAssetFiles(selected);
    setError("");
    try {
      const result =
        kind === "html"
          ? await prepareHtmlContent(source, fileName, selected)
          : await prepareMarkdownContent(source, fileName, selected);
      setSource(result.source);
      setWarnings(result.warnings);
      setMetadata((current) => ({
        ...current,
        ...result.metadata,
        title: current.title || result.metadata.title || result.title,
      }));
      if (result.metadata.extra) {
        setExtraJson(JSON.stringify(result.metadata.extra, null, 2));
      }
    } catch (caught) {
      setError(messageOf(caught));
    }
  }

  async function saveDraft() {
    setBusy(true);
    setError("");
    try {
      const prepared = await prepare();
      const normalizedMetadata = {
        ...metadata,
        title: metadata.title.trim() || prepared.title,
        extra: JSON.parse(extraJson) as DocumentMetadata["extra"],
      };
      const intent = await adminRequest<{
        intentToken: string;
        assets: Array<{
          index: number;
          pathname: string;
          relativePath: string;
          placeholder: null;
        }>;
      }>("/api/admin/import-intents", {
        method: "POST",
        body: JSON.stringify({
          kind,
          originalFileName: fileName,
          assets: prepared.assets.map((asset, index) => ({
            index,
            sha256: asset.sha256,
            extension: asset.extension,
            contentType: asset.contentType,
            relativePath: asset.relativePath,
            size: asset.size,
          })),
        }),
      });
      const uploaded = await uploadDirectAssets(
        prepared.assets,
        intent.assets,
        intent.intentToken,
      );
      const document = await adminRequest<VersionedDocument>(
        "/api/admin/documents",
        {
          method: "POST",
          body: JSON.stringify({
            intentToken: intent.intentToken,
            originalFileName: fileName,
            contentKind: kind,
            source: prepared.source,
            assets: uploaded,
            metadata: normalizedMetadata,
            categoryId,
            subcategoryId,
          }),
        },
      );
      setSource("");
      setAssetFiles([]);
      setMetadata(emptyMetadata);
      setExtraJson("{}");
      setWarnings([]);
      onCreated(document);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  const liveHtml = useMemo(
    () => (kind === "html" && source ? processHtmlContent(source) : null),
    [kind, source],
  );
  const visibleWarnings = liveHtml?.warnings ?? warnings;
  const htmlPreview = liveHtml
    ? injectControlledBase(liveHtml.html, "https://preview.invalid/assets/")
    : "";

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xl font-semibold">
          {kind === "html" ? "Publicar HTML" : "Publicar Markdown"}
        </h3>
        <p className="text-sm text-muted-foreground">
          {kind === "html"
            ? "El código se conserva como HTML estático y se elimina cualquier comportamiento activo."
            : "Carga un .md o escribe y pega el Markdown directamente."}
        </p>
      </div>
      <div className="flex flex-wrap gap-4">
        <Field
          label={kind === "html" ? "Archivo .html" : "Archivo .md (opcional)"}
        >
          <input
            type="file"
            accept={kind === "html" ? ".html,text/html" : ".md,text/markdown"}
            disabled={busy}
            onChange={(event) => void loadMainFile(event.target.files?.[0])}
          />
        </Field>
        <Field label="Carpeta complementaria de recursos (opcional)">
          <input
            ref={(node) => {
              if (node) node.setAttribute("webkitdirectory", "");
            }}
            type="file"
            multiple
            disabled={busy}
            onChange={(event) => void selectAssets(event.target.files)}
          />
        </Field>
        <Field label="O seleccionar recursos sueltos">
          <input
            type="file"
            multiple
            disabled={busy}
            onChange={(event) => void selectAssets(event.target.files)}
          />
        </Field>
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
      {visibleWarnings.length ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <strong>Elementos ajustados por seguridad</strong>
          <ul className="mt-2 list-disc pl-5">
            {visibleWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-2">
        <textarea
          aria-label={kind === "html" ? "Código HTML" : "Contenido Markdown"}
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder={
            kind === "markdown" ? "# Título\n\nContenido…" : "<!doctype html>…"
          }
          className="min-h-[30rem] rounded-xl border bg-background p-4 font-mono text-sm"
        />
        {kind === "markdown" ? (
          <div className="max-h-[36rem] overflow-auto rounded-xl border bg-background p-5">
            <MarkdownRenderer source={source} />
          </div>
        ) : (
          <iframe
            title="Vista previa HTML aislada"
            sandbox=""
            srcDoc={htmlPreview}
            className="min-h-[30rem] w-full rounded-xl border bg-white"
          />
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        {assetFiles.length} recurso{assetFiles.length === 1 ? "" : "s"}{" "}
        seleccionado{assetFiles.length === 1 ? "" : "s"}.
      </p>
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      <button
        disabled={busy || !source.trim()}
        onClick={saveDraft}
        className="button-primary disabled:opacity-60"
      >
        {busy ? "Guardando…" : "Guardar borrador"}
      </button>
    </div>
  );
}

async function uploadDirectAssets(
  assets: BrowserAsset[],
  targets: Array<{
    index: number;
    pathname: string;
    relativePath: string;
    placeholder: null;
  }>,
  intentToken: string,
) {
  return Promise.all(
    assets.map(async (asset, index) => {
      const target = targets.find((item) => item.index === index);
      if (!target) throw new Error("No se reservó la ruta de un recurso.");
      const body =
        asset.file.type === asset.contentType
          ? asset.file
          : new Blob([await asset.file.arrayBuffer()], {
              type: asset.contentType,
            });
      const result = await upload(target.pathname, body, {
        access: "public",
        handleUploadUrl: "/api/admin/blob/upload",
        clientPayload: intentToken,
      });
      return {
        index,
        placeholder: null,
        originalName: asset.originalName,
        relativePath: target.relativePath,
        pathname: result.pathname,
        url: result.url,
        contentType: asset.contentType,
        size: asset.size,
        sha256: asset.sha256,
      };
    }),
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
  const [source, setSource] = useState(document.source);
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
    source !== document.source ||
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
            source,
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
      {document.manifest.assets.length ? (
        <details className="rounded-xl border p-4">
          <summary className="cursor-pointer font-medium">
            Recursos asociados ({document.manifest.assets.length})
          </summary>
          <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
            {document.manifest.assets.map((asset) => (
              <li key={asset.id} className="break-all font-mono">
                {asset.relativePath}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-2">
        <textarea
          aria-label={
            document.manifest.content.kind === "html" ? "HTML" : "Markdown"
          }
          value={source}
          onChange={(event) => setSource(event.target.value)}
          className="min-h-[32rem] rounded-xl border bg-background p-4 font-mono text-sm"
        />
        {document.manifest.content.kind === "markdown" ? (
          <div className="max-h-[42rem] overflow-auto rounded-xl border bg-background p-5">
            <MarkdownRenderer
              source={source}
              baseUrl={document.manifest.content.url}
            />
          </div>
        ) : (
          <iframe
            title="Vista previa HTML"
            sandbox=""
            srcDoc={injectControlledBase(
              processHtmlContent(source).html,
              document.manifest.content.assetBaseUrl ??
                document.manifest.content.url,
            )}
            className="min-h-[32rem] w-full rounded-xl border bg-white"
          />
        )}
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
  documents: VersionedManifest[];
  loading: boolean;
  onEdit: (document: VersionedManifest) => void;
  onTrash: (document: VersionedManifest) => void;
  onAction: (document: VersionedManifest, action: string) => void;
}) {
  const [status, setStatus] = useState<DocumentStatus | "all">("all");
  const [page, setPage] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);
  const filtered = documents.filter(
    (document) => status === "all" || document.manifest.status === status,
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
            key={document.manifest.id}
            className="flex flex-col justify-between gap-4 rounded-xl border p-4 sm:flex-row sm:items-center"
          >
            <div>
              <h3 className="font-semibold">
                {document.manifest.metadata.title}
              </h3>
              <p className="text-sm text-muted-foreground">
                {document.manifest.status} ·{" "}
                {document.manifest.content.kind.toUpperCase()} ·{" "}
                {new Date(document.manifest.updatedAt).toLocaleString()}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => onEdit(document)}
                className="button-secondary"
              >
                Editar
              </button>
              {document.manifest.status === "draft" ? (
                <button
                  onClick={() => onAction(document, "publish")}
                  className="button-primary"
                >
                  Publicar
                </button>
              ) : null}
              {document.manifest.status === "published" ? (
                <>
                  <button
                    onClick={() => onAction(document, "unpublish")}
                    className="button-secondary"
                  >
                    Despublicar
                  </button>
                  <button
                    aria-disabled={
                      cleanupRemainingMinutes(
                        document.manifest.updatedAt,
                        now,
                      ) > 0
                    }
                    title={cleanupButtonTitle(document.manifest.updatedAt, now)}
                    onClick={() => onAction(document, "cleanup")}
                    className={`button-secondary ${
                      cleanupRemainingMinutes(
                        document.manifest.updatedAt,
                        now,
                      ) > 0
                        ? "cursor-not-allowed opacity-50"
                        : ""
                    }`}
                  >
                    Limpiar versiones
                  </button>
                </>
              ) : null}
              {document.manifest.status !== "trashed" ? (
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

function cleanupButtonTitle(updatedAt: string, now: number): string {
  const remainingMinutes = cleanupRemainingMinutes(updatedAt, now);
  return remainingMinutes > 0
    ? `Disponible en ${remainingMinutes} minuto${remainingMinutes === 1 ? "" : "s"}`
    : "Conservar la versión activa y la anterior";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function upsertDocument(
  documents: VersionedManifest[],
  updated: VersionedManifest,
): VersionedManifest[] {
  return [
    updated,
    ...documents.filter((item) => item.manifest.id !== updated.manifest.id),
  ].sort((left, right) =>
    right.manifest.updatedAt.localeCompare(left.manifest.updatedAt),
  );
}
