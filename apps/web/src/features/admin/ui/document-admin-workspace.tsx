"use client";

import { upload } from "@vercel/blob/client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  injectControlledBase,
  processHtmlContent,
} from "@/features/content-management/application/html-content";
import { markdownLocalAssetReferences } from "@/features/content-management/application/markdown-content";

import {
  createShortId,
  slugify,
} from "@/features/content-management/application/document-paths";
import { cleanupRemainingMinutes } from "@/features/content-management/application/document-retention";
import { resolveSharedAssetReferences } from "@/features/content-management/application/shared-asset-localization";
import {
  finalizeTaxonomyLocalizations,
  updateLocalizedTaxonomyName,
} from "@/features/content-management/application/taxonomy-localization";
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

  async function transition(
    document: VersionedManifest,
    action: string,
    locale: "es" | "en" = "es",
  ) {
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
          body: JSON.stringify({ expectedEtag: document.etag, locale }),
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
          body: JSON.stringify({ expectedEtag: document.etag, locale }),
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
        onExisting={async (id) => {
          const document = await adminRequest<VersionedDocument>(
            `/api/admin/documents/${id}`,
          );
          setDocumentCache((current) => ({ ...current, [id]: document }));
          setSelected(document);
        }}
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
          documents={documents}
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
  onExisting: (id: string) => void;
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
  onExisting: (id: string) => void;
}) {
  const converter = useMemo(() => new MammothDocxConverter(), []);
  const [file, setFile] = useState<File | null>(null);
  const [converted, setConverted] = useState<ConvertedDocx | null>(null);
  const [existing, setExisting] = useState<VersionedDocument | null>(null);
  const [previewAssetUrls, setPreviewAssetUrls] = useState<
    Record<string, string>
  >({});
  const [markdownSource, setMarkdownSource] = useState("");
  const [metadata, setMetadata] = useState<DocumentMetadata>(emptyMetadata);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [extraJson, setExtraJson] = useState("{}");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [activeLocale, setActiveLocale] = useState<"es" | "en">("es");
  const [englishDraft, setEnglishDraft] = useState<TranslationDraft | null>(
    null,
  );
  const [includeEnglish, setIncludeEnglish] = useState(false);

  useEffect(() => {
    if (!converted) {
      setPreviewAssetUrls({});
      return;
    }
    const urls = Object.fromEntries(
      converted.assets.map((asset) => [
        asset.placeholder,
        URL.createObjectURL(asset.blob),
      ]),
    );
    setPreviewAssetUrls(urls);
    return () => Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
  }, [converted]);

  async function selectFile(selected: File | undefined) {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const result = await converter.convert(selected);
      const duplicate = await adminRequest<{
        existingDocumentId: string | null;
      }>(
        `/api/admin/import-intents?fileName=${encodeURIComponent(selected.name)}`,
      );
      if (duplicate.existingDocumentId) {
        const document = await adminRequest<VersionedDocument>(
          `/api/admin/documents/${duplicate.existingDocumentId}`,
        );
        setExisting(document);
        setMetadata(document.manifest.metadata);
        setCategoryId(document.manifest.categoryId);
        setSubcategoryId(document.manifest.subcategoryId);
        setExtraJson(JSON.stringify(document.manifest.metadata.extra, null, 2));
        setIncludeEnglish(false);
        setEnglishDraft(null);
      } else {
        setExisting(null);
        setMetadata({
          ...emptyMetadata,
          title: selected.name.replace(/\.docx$/i, ""),
        });
      }
      setFile(selected);
      setConverted(result);
      setMarkdownSource(result.markdown);
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
          existingDocumentId: existing?.manifest.id,
          expectedEtag: existing?.etag,
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
      const englishSource =
        includeEnglish && englishDraft
          ? resolveSharedAssetReferences(
              englishDraft.source,
              englishDraft.assets,
              converted.assets.map((asset) => ({
                index: asset.index,
                sha256: asset.sha256,
                relativePath: `images/image-${asset.index + 1}.${asset.extension}`,
                placeholder: `__DOCX_ASSET_${asset.index}__`,
              })),
              uploaded,
            )
          : null;
      const document = await adminRequest<VersionedDocument>(
        existing
          ? `/api/admin/documents/${existing.manifest.id}/reimport`
          : "/api/admin/documents",
        {
          method: "POST",
          body: JSON.stringify({
            intentToken: intent.intentToken,
            ...(existing
              ? {
                  source: markdownSource,
                  metadata: localizedMetadata({ ...metadata, extra }),
                  expectedEtag: existing.etag,
                }
              : {
                  variants: [
                    {
                      locale: "es",
                      originalFileName: file.name,
                      contentKind: "docx",
                      source: markdownSource,
                      metadata: localizedMetadata({ ...metadata, extra }),
                    },
                    ...(includeEnglish && englishDraft && englishSource
                      ? [
                          {
                            locale: "en" as const,
                            originalFileName: englishDraft.fileName,
                            contentKind: englishDraft.kind,
                            source: englishSource,
                            metadata: localizedMetadata(englishDraft.metadata),
                          },
                        ]
                      : []),
                  ],
                }),
            assets: uploaded,
            order: metadata.order,
            categoryId,
            subcategoryId,
          }),
        },
      );
      setFile(null);
      setConverted(null);
      setExisting(null);
      setMarkdownSource("");
      setMetadata(emptyMetadata);
      setExtraJson("{}");
      setEnglishDraft(null);
      setIncludeEnglish(false);
      setActiveLocale("es");
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
          {existing ? (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              Se reemplazará la versión española existente y sus imágenes. La
              versión inglesa, si existe, se conservará.
            </p>
          ) : (
            <LanguageTabs
              active={activeLocale}
              hasEnglish={includeEnglish}
              onChange={setActiveLocale}
              onAddLocale={() => {
                setIncludeEnglish(true);
                setActiveLocale("en");
              }}
            />
          )}
          {activeLocale === "es" ? (
            <>
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
                  <MarkdownRenderer
                    source={markdownSource}
                    components={{
                      img: ({ src, alt, ...props }) => (
                        // The preview uses browser-only object URLs; Next/Image
                        // cannot optimize resources that have not been uploaded.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          {...props}
                          alt={alt ?? ""}
                          src={
                            typeof src === "string"
                              ? (previewAssetUrls[src] ?? src)
                              : undefined
                          }
                        />
                      ),
                    }}
                  />
                </div>
              </div>
            </>
          ) : (
            <TranslationDraftPanel
              value={englishDraft}
              onChange={setEnglishDraft}
              sharedAssets={converted.assets.map((asset) => ({
                index: asset.index,
                sha256: asset.sha256,
                relativePath: `images/image-${asset.index + 1}.${asset.extension}`,
                placeholder: `__DOCX_ASSET_${asset.index}__`,
              }))}
            />
          )}
          <button
            disabled={
              busy ||
              !metadata.title.trim() ||
              !markdownSource.trim() ||
              (includeEnglish &&
                (!englishDraft?.source.trim() ||
                  !englishDraft.metadata.title.trim() ||
                  Boolean(englishDraft.validationError)))
            }
            onClick={saveDraft}
            className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60"
          >
            {busy
              ? "Guardando…"
              : `${existing ? "Reemplazar DOCX" : "Guardar borrador"} (${converted.assets.length} imágenes)`}
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
  onExisting,
}: {
  kind: "markdown" | "html";
  taxonomy: Taxonomy;
  onCreated: (document: VersionedDocument) => void;
  onExisting: (id: string) => void;
}) {
  const [source, setSource] = useState("");
  const [fileName, setFileName] = useState(
    kind === "markdown" ? "nuevo.md" : "documento.html",
  );
  const [assetFiles, setAssetFiles] = useState<File[]>([]);
  const [sharedAssets, setSharedAssets] = useState<TranslationAsset[]>([]);
  const [metadata, setMetadata] = useState<DocumentMetadata>(emptyMetadata);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [extraJson, setExtraJson] = useState("{}");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [activeLocale, setActiveLocale] = useState<"es" | "en">("es");
  const [englishDraft, setEnglishDraft] = useState<TranslationDraft | null>(
    null,
  );
  const [includeEnglish, setIncludeEnglish] = useState(false);

  async function prepare(currentSource = source, currentFiles = assetFiles) {
    return kind === "html"
      ? prepareHtmlContent(currentSource, fileName, currentFiles)
      : prepareMarkdownContent(currentSource, fileName, currentFiles);
  }

  async function loadMainFile(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      const duplicate = await adminRequest<{
        existingDocumentId: string | null;
      }>(`/api/admin/import-intents?fileName=${encodeURIComponent(file.name)}`);
      if (duplicate.existingDocumentId) {
        setError(
          "Ese laboratorio ya existe. Se abrió su edición para agregar o reemplazar idiomas.",
        );
        onExisting(duplicate.existingDocumentId);
        return;
      }
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
      setSharedAssets(
        result.assets.map((asset, index) => ({
          index,
          sha256: asset.sha256,
          relativePath: asset.relativePath,
          placeholder: null,
        })),
      );
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
      setSharedAssets(
        result.assets.map((asset, index) => ({
          index,
          sha256: asset.sha256,
          relativePath: asset.relativePath,
          placeholder: null,
        })),
      );
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
      const englishSource =
        includeEnglish && englishDraft
          ? resolveSharedAssetReferences(
              englishDraft.source,
              englishDraft.assets,
              prepared.assets.map((asset, index) => ({
                index,
                sha256: asset.sha256,
                relativePath: asset.relativePath,
                placeholder: null,
              })),
              uploaded,
            )
          : null;
      const document = await adminRequest<VersionedDocument>(
        "/api/admin/documents",
        {
          method: "POST",
          body: JSON.stringify({
            intentToken: intent.intentToken,
            variants: [
              {
                locale: "es",
                originalFileName: fileName,
                contentKind: kind,
                source: prepared.source,
                metadata: localizedMetadata(normalizedMetadata),
              },
              ...(includeEnglish && englishDraft && englishSource
                ? [
                    {
                      locale: "en" as const,
                      originalFileName: englishDraft.fileName,
                      contentKind: englishDraft.kind,
                      source: englishSource,
                      metadata: localizedMetadata(englishDraft.metadata),
                    },
                  ]
                : []),
            ],
            assets: uploaded,
            order: normalizedMetadata.order,
            categoryId,
            subcategoryId,
          }),
        },
      );
      setSource("");
      setAssetFiles([]);
      setSharedAssets([]);
      setMetadata(emptyMetadata);
      setExtraJson("{}");
      setWarnings([]);
      setEnglishDraft(null);
      setIncludeEnglish(false);
      setActiveLocale("es");
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
      <LanguageTabs
        active={activeLocale}
        hasEnglish={includeEnglish}
        onChange={setActiveLocale}
        onAddLocale={() => {
          setIncludeEnglish(true);
          setActiveLocale("en");
        }}
      />
      {activeLocale === "es" ? (
        <>
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
              aria-label={
                kind === "html" ? "Código HTML" : "Contenido Markdown"
              }
              value={source}
              onChange={(event) => setSource(event.target.value)}
              placeholder={
                kind === "markdown"
                  ? "# Título\n\nContenido…"
                  : "<!doctype html>…"
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
        </>
      ) : (
        <TranslationDraftPanel
          value={englishDraft}
          onChange={setEnglishDraft}
          sharedAssets={sharedAssets}
        />
      )}
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      <button
        disabled={
          busy ||
          !source.trim() ||
          (includeEnglish &&
            (!englishDraft?.source.trim() ||
              !englishDraft.metadata.title.trim() ||
              Boolean(englishDraft.validationError)))
        }
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

type TranslationAsset = {
  index: number;
  sha256: string;
  relativePath: string;
  placeholder: string | null;
};

type TranslationDraft = {
  kind: "docx" | "markdown" | "html";
  fileName: string;
  source: string;
  metadata: DocumentMetadata;
  warnings: string[];
  assets: TranslationAsset[];
  validationError: string | null;
};

function normalizeAssetReference(value: string): string {
  return value
    .split(/[?#]/u)[0]
    .replaceAll("\\", "/")
    .replace(/^\.\//u, "")
    .replace(/^assets\//u, "");
}

function fileNameForTitle(
  title: string,
  kind: TranslationDraft["kind"],
): string {
  if (!title.trim()) return "";
  const base = slugify(title.trim());
  return `${base}.${kind === "html" ? "html" : "md"}`;
}

function LanguageTabs({
  active,
  hasEnglish,
  onAddLocale,
  onChange,
}: {
  active: "es" | "en";
  hasEnglish: boolean;
  onAddLocale: (locale: "en") => void;
  onChange: (locale: "es" | "en") => void;
}) {
  const [selectingLocale, setSelectingLocale] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={active === "es"}
        onClick={() => onChange("es")}
        className={active === "es" ? "button-primary" : "button-secondary"}
      >
        Español
      </button>
      {hasEnglish ? (
        <button
          type="button"
          role="tab"
          aria-selected={active === "en"}
          onClick={() => onChange("en")}
          className={active === "en" ? "button-primary" : "button-secondary"}
        >
          Inglés
        </button>
      ) : (
        <>
          {selectingLocale ? (
            <label className="flex items-center gap-2 text-sm">
              <span>Idioma a agregar</span>
              <select
                autoFocus
                defaultValue=""
                className="input min-w-44"
                onChange={(event) => {
                  if (event.target.value === "en") onAddLocale("en");
                }}
              >
                <option value="" disabled>
                  Selecciona un idioma
                </option>
                <option value="en">Inglés</option>
              </select>
            </label>
          ) : (
            <button
              type="button"
              onClick={() => setSelectingLocale(true)}
              className="button-secondary"
            >
              + Agregar otro idioma
            </button>
          )}
        </>
      )}
    </div>
  );
}

function TranslationDraftPanel({
  value,
  onChange,
  sharedAssets = [],
  sharedBaseUrl,
  reservedSlugs = [],
}: {
  value: TranslationDraft | null;
  onChange: (value: TranslationDraft) => void;
  sharedAssets?: TranslationAsset[];
  sharedBaseUrl?: string | null;
  reservedSlugs?: string[];
}) {
  const converter = useMemo(() => new MammothDocxConverter(), []);
  const [draft, setDraft] = useState<TranslationDraft>(
    value ?? {
      kind: "docx",
      fileName: "",
      source: "",
      metadata: emptyMetadata,
      warnings: [],
      assets: [],
      validationError: null,
    },
  );
  const [createFile, setCreateFile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => onChange(draft), [draft, onChange]);

  function validateSource(
    kind: TranslationDraft["kind"],
    source: string,
  ): string | null {
    if (kind === "docx" || !source.trim()) return null;
    try {
      const references =
        kind === "html"
          ? processHtmlContent(source).localReferences
          : markdownLocalAssetReferences(source);
      const available = new Set(
        sharedAssets.map((asset) =>
          normalizeAssetReference(asset.relativePath),
        ),
      );
      const missing = references.filter(
        (reference) => !available.has(normalizeAssetReference(reference)),
      );
      return missing.length
        ? `No se encontraron estos recursos en la versión en español: ${missing.join(", ")}`
        : null;
    } catch (caught) {
      return messageOf(caught);
    }
  }

  function duplicateError(fileName: string): string | null {
    if (!fileName.trim()) return null;
    const nextSlug = slugify(fileName);
    return reservedSlugs.includes(nextSlug)
      ? "Ya existe una versión en inglés con ese nombre."
      : null;
  }

  async function loadFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      if (draft.kind === "docx") {
        const converted = await converter.convert(file);
        setDraft((current) => ({
          ...current,
          fileName: file.name,
          source: converted.markdown,
          metadata: {
            ...current.metadata,
            title: file.name.replace(/\.docx$/i, ""),
          },
          warnings: converted.warnings,
          assets: converted.assets.map((asset) => ({
            index: asset.index,
            sha256: asset.sha256,
            relativePath: `image-${asset.index + 1}.${asset.extension}`,
            placeholder: `__DOCX_ASSET_${asset.index}__`,
          })),
          validationError: duplicateError(file.name),
        }));
      } else {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(
          await file.arrayBuffer(),
        );
        const processed =
          draft.kind === "html" ? processHtmlContent(text) : null;
        setDraft((current) => ({
          ...current,
          fileName: file.name,
          source: processed?.html ?? text,
          metadata: {
            ...current.metadata,
            title: file.name.replace(/\.(?:md|markdown|html?)$/i, ""),
          },
          warnings: processed?.warnings ?? [],
          assets: [],
          validationError:
            duplicateError(file.name) ??
            validateSource(draft.kind, processed?.html ?? text),
        }));
      }
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 rounded-xl border p-4">
      <div className="flex flex-wrap gap-4">
        <Field label="Formato de la traducción">
          <select
            value={draft.kind}
            onChange={(event) => {
              const kind = event.target.value as TranslationDraft["kind"];
              setDraft({
                kind,
                fileName: "",
                source: "",
                metadata: emptyMetadata,
                warnings: [],
                assets: [],
                validationError: null,
              });
              setCreateFile(false);
              setError("");
            }}
            className="input"
          >
            <option value="docx">DOCX</option>
            <option value="markdown">Markdown</option>
            <option value="html">HTML</option>
          </select>
        </Field>
        {draft.kind !== "docx" ? (
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input
              type="checkbox"
              checked={createFile}
              onChange={(event) => {
                const checked = event.target.checked;
                setCreateFile(checked);
                setError("");
                setDraft((current) => ({
                  ...current,
                  fileName: checked
                    ? fileNameForTitle(current.metadata.title, current.kind)
                    : "",
                  source: "",
                  warnings: [],
                  assets: [],
                  validationError: null,
                }));
              }}
            />
            Crear archivo
          </label>
        ) : null}
        {!createFile ? (
          <Field label="Archivo en inglés">
            <input
              type="file"
              accept={
                draft.kind === "docx"
                  ? ".docx"
                  : draft.kind === "html"
                    ? ".html,text/html"
                    : ".md,.markdown,text/markdown"
              }
              disabled={busy}
              onChange={(event) => void loadFile(event.target.files?.[0])}
            />
          </Field>
        ) : (
          <Field label="Archivo que se creará">
            <input value={draft.fileName} readOnly className="input" />
          </Field>
        )}
      </div>
      <LocalizedMetadataFields
        metadata={draft.metadata}
        onChange={(metadata) => {
          setDraft((current) => {
            const fileName = createFile
              ? fileNameForTitle(metadata.title, current.kind)
              : current.fileName;
            return {
              ...current,
              metadata,
              fileName,
              validationError:
                duplicateError(fileName) ??
                validateSource(current.kind, current.source),
            };
          });
        }}
      />
      {sharedAssets.length ? (
        <details className="rounded-lg border p-3 text-sm">
          <summary className="cursor-pointer font-medium">
            Imágenes compartidas disponibles ({sharedAssets.length})
          </summary>
          <p className="mt-2 text-muted-foreground">
            Usa estas mismas rutas en la traducción; no es necesario volver a
            subir las imágenes.
          </p>
          <ul className="mt-2 space-y-1">
            {sharedAssets.map((asset) => (
              <li
                key={`${asset.index}-${asset.relativePath}`}
                className="break-all font-mono"
              >
                {asset.relativePath}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {draft.warnings.length ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <strong>Advertencias</strong>
          <ul className="mt-2 list-disc pl-5">
            {draft.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-2">
        <textarea
          aria-label="Contenido en inglés"
          value={draft.source}
          onChange={(event) => {
            const source = event.target.value;
            setDraft((current) => ({
              ...current,
              source,
              validationError:
                duplicateError(current.fileName) ??
                validateSource(current.kind, source),
            }));
          }}
          className="min-h-[28rem] rounded-xl border bg-background p-4 font-mono text-sm"
        />
        {draft.kind === "html" ? (
          <iframe
            title="Vista previa HTML en inglés"
            sandbox=""
            srcDoc={
              draft.source
                ? injectControlledBase(
                    processHtmlContent(draft.source).html,
                    sharedBaseUrl ?? "https://preview.invalid/assets/",
                  )
                : ""
            }
            className="min-h-[28rem] w-full rounded-xl border bg-white"
          />
        ) : (
          <div className="max-h-[36rem] overflow-auto rounded-xl border bg-background p-5">
            <MarkdownRenderer
              source={draft.source}
              baseUrl={sharedBaseUrl ?? undefined}
            />
          </div>
        )}
      </div>
      {draft.validationError ? (
        <p role="alert" className="text-destructive">
          {draft.validationError}
        </p>
      ) : null}
      {error ? <p className="text-destructive">{error}</p> : null}
    </div>
  );
}

function LocalizedMetadataFields({
  metadata,
  onChange,
}: {
  metadata: DocumentMetadata;
  onChange: (value: DocumentMetadata) => void;
}) {
  const update = <K extends keyof DocumentMetadata>(
    key: K,
    value: DocumentMetadata[K],
  ) => onChange({ ...metadata, [key]: value });
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Title">
        <input
          value={metadata.title}
          onChange={(event) => update("title", event.target.value)}
          className="input"
        />
      </Field>
      <Field label="Author">
        <input
          value={metadata.author}
          onChange={(event) => update("author", event.target.value)}
          className="input"
        />
      </Field>
      <Field label="Summary">
        <textarea
          value={metadata.summary}
          onChange={(event) => update("summary", event.target.value)}
          className="input min-h-20"
        />
      </Field>
      <Field label="Tags">
        <input
          value={metadata.tags.join(", ")}
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
    </div>
  );
}

function DocumentEditor({
  document,
  documents,
  taxonomy,
  onClose,
  onSaved,
}: {
  document: VersionedDocument;
  documents: VersionedManifest[];
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
  const [activeLocale, setActiveLocale] = useState<"es" | "en">("es");
  const [englishEnabled, setEnglishEnabled] = useState(
    Boolean(document.manifest.localizations.en),
  );
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
            locale: "es",
            source,
            metadata: localizedMetadata({
              ...metadata,
              extra: JSON.parse(extraJson),
            }),
            order: metadata.order,
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
      <LanguageTabs
        active={activeLocale}
        hasEnglish={englishEnabled}
        onChange={setActiveLocale}
        onAddLocale={() => {
          setEnglishEnabled(true);
          setActiveLocale("en");
        }}
      />
      {englishEnabled ? (
        <div hidden={activeLocale !== "en"}>
          <EnglishDocumentEditor
            document={document}
            taxonomy={taxonomy}
            reservedSlugs={documents
              .filter((item) => item.manifest.id !== document.manifest.id)
              .flatMap((item) => {
                const slug = item.manifest.localizations.en?.slug;
                return slug ? [slug] : [];
              })}
            onSaved={onSaved}
          />
        </div>
      ) : null}
      <div hidden={activeLocale !== "es"} className="space-y-5">
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
      </div>
    </section>
  );
}

function EnglishDocumentEditor({
  document,
  taxonomy,
  reservedSlugs,
  onSaved,
}: {
  document: VersionedDocument;
  taxonomy: Taxonomy;
  reservedSlugs: string[];
  onSaved: (document: VersionedDocument) => void;
}) {
  const existing = document.manifest.localizations.en;
  const [draft, setDraft] = useState<TranslationDraft | null>(null);
  const [source, setSource] = useState(document.sources.en ?? "");
  const [metadata, setMetadata] = useState<DocumentMetadata>(
    existing
      ? { ...existing.metadata, order: document.manifest.order }
      : emptyMetadata,
  );
  const [categoryId, setCategoryId] = useState(document.manifest.categoryId);
  const [subcategoryId, setSubcategoryId] = useState(
    document.manifest.subcategoryId,
  );
  const [extraJson, setExtraJson] = useState(
    JSON.stringify(existing?.metadata.extra ?? {}, null, 2),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      let nextSource = source;
      let nextMetadata = metadata;
      let originalFileName: string | undefined;
      let slug: string | undefined;
      let contentKind: "markdown" | "html" | undefined;
      if (!existing) {
        if (!draft) throw new Error("Selecciona el archivo en inglés.");
        const shared = document.manifest.assets.map((asset, index) => ({
          index,
          sha256: asset.sha256,
          relativePath: asset.relativePath,
          placeholder: null,
        }));
        nextSource = resolveSharedAssetReferences(
          draft.source,
          draft.assets,
          shared,
          document.manifest.assets.map((asset, index) => ({
            index,
            relativePath: asset.relativePath,
            sha256: asset.sha256,
          })),
        );
        nextMetadata = draft.metadata;
        originalFileName = draft.fileName;
        slug = slugify(draft.fileName);
        contentKind = draft.kind === "html" ? "html" : "markdown";
      }
      const updated = await adminRequest<VersionedDocument>(
        `/api/admin/documents/${document.manifest.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            locale: "en",
            slug,
            originalFileName,
            contentKind,
            source: nextSource,
            metadata: localizedMetadata({
              ...nextMetadata,
              extra: existing ? JSON.parse(extraJson) : nextMetadata.extra,
            }),
            order: nextMetadata.order,
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

  async function remove() {
    if (!window.confirm("¿Eliminar la versión en inglés?")) return;
    setBusy(true);
    try {
      const updated = await adminRequest<VersionedManifest>(
        `/api/admin/documents/${document.manifest.id}`,
        {
          method: "DELETE",
          body: JSON.stringify({
            locale: "en",
            expectedEtag: document.etag,
          }),
        },
      );
      const spanish = document.sources.es ?? document.source;
      onSaved({
        ...updated,
        sources: { es: spanish },
        source: spanish,
      });
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  if (!existing) {
    return (
      <div className="space-y-4">
        <TranslationDraftPanel
          value={draft}
          onChange={setDraft}
          sharedAssets={document.manifest.assets.map((asset, index) => ({
            index,
            sha256: asset.sha256,
            relativePath: asset.relativePath,
            placeholder: null,
          }))}
          sharedBaseUrl={
            document.manifest.localizations.es?.content.assetBaseUrl ??
            document.manifest.localizations.es?.content.url ??
            document.manifest.content.assetBaseUrl ??
            document.manifest.content.url
          }
          reservedSlugs={reservedSlugs}
        />
        {error ? <p className="text-destructive">{error}</p> : null}
        <button
          type="button"
          disabled={
            busy ||
            !draft?.source.trim() ||
            !draft.metadata.title.trim() ||
            Boolean(draft.validationError)
          }
          onClick={save}
          className="button-primary disabled:opacity-60"
        >
          {busy ? "Guardando…" : "Agregar versión en inglés"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
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
          aria-label={
            existing.content.kind === "html" ? "HTML EN" : "Markdown EN"
          }
          value={source}
          onChange={(event) => setSource(event.target.value)}
          className="min-h-[32rem] rounded-xl border bg-background p-4 font-mono text-sm"
        />
        {existing.content.kind === "markdown" ? (
          <div className="max-h-[42rem] overflow-auto rounded-xl border bg-background p-5">
            <MarkdownRenderer
              source={source}
              baseUrl={existing.content.assetBaseUrl ?? existing.content.url}
            />
          </div>
        ) : (
          <iframe
            title="Vista previa HTML EN"
            sandbox=""
            srcDoc={injectControlledBase(
              processHtmlContent(source).html,
              existing.content.assetBaseUrl ?? existing.content.url,
            )}
            className="min-h-[32rem] w-full rounded-xl border bg-white"
          />
        )}
      </div>
      {error ? <p className="text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || !source.trim()}
          onClick={save}
          className="button-primary disabled:opacity-60"
        >
          {busy ? "Guardando…" : "Guardar inglés"}
        </button>
        <button
          type="button"
          disabled={busy || existing.status === "published"}
          onClick={remove}
          className="button-danger disabled:opacity-60"
          title={
            existing.status === "published"
              ? "Despublica inglés antes de eliminarlo"
              : undefined
          }
        >
          Eliminar inglés
        </button>
      </div>
    </div>
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
  onAction: (
    document: VersionedManifest,
    action: string,
    locale?: "es" | "en",
  ) => void;
}) {
  const [status, setStatus] = useState<DocumentStatus | "all">("all");
  const [page, setPage] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);
  const filtered = documents.filter(
    (document) =>
      status === "all" ||
      Object.values(document.manifest.localizations).some(
        (localization) => localization?.status === status,
      ),
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
                ES: {document.manifest.localizations.es?.status} ·{" "}
                {document.manifest.localizations.en
                  ? `EN: ${document.manifest.localizations.en.status} · `
                  : "EN: pendiente · "}
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
              {document.manifest.localizations.en?.status === "draft" ? (
                <button
                  onClick={() => onAction(document, "publish", "en")}
                  className="button-primary"
                >
                  Publicar EN
                </button>
              ) : null}
              {document.manifest.localizations.en?.status === "published" ? (
                <button
                  onClick={() => onAction(document, "unpublish", "en")}
                  className="button-secondary"
                >
                  Despublicar EN
                </button>
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
  const [activeLocale, setActiveLocale] = useState<"es" | "en">("es");
  const addCategory = () =>
    setTaxonomy({
      ...taxonomy,
      categories: [
        ...taxonomy.categories,
        {
          id: createShortId(),
          slug: `categoria-${taxonomy.categories.length + 1}`,
          name: "Nueva categoría",
          localizations: {
            es: {
              slug: `categoria-${taxonomy.categories.length + 1}`,
              name: "Nueva categoría",
            },
          },
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
  const updateCategoryLabel = (category: Category, name: string) =>
    updateCategory(category.id, {
      localizations: updateLocalizedTaxonomyName(
        category.localizations,
        activeLocale,
        name,
      ),
      ...(activeLocale === "es" ? { name } : {}),
    });
  async function save() {
    try {
      const normalized = {
        ...taxonomy,
        updatedAt: new Date().toISOString(),
        categories: taxonomy.categories.map((category) => {
          const localizations = finalizeTaxonomyLocalizations(
            category.localizations,
            category.id,
          );
          return {
            ...category,
            name: localizations.es.name,
            slug: localizations.es.slug,
            localizations,
            subcategories: category.subcategories.map((subcategory) => {
              const subcategoryLocalizations = finalizeTaxonomyLocalizations(
                subcategory.localizations,
                subcategory.id,
              );
              return {
                ...subcategory,
                name: subcategoryLocalizations.es.name,
                slug: subcategoryLocalizations.es.slug,
                localizations: subcategoryLocalizations,
              };
            }),
          };
        }),
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
      <div
        className="flex gap-2"
        role="tablist"
        aria-label="Idioma de taxonomía"
      >
        {(["es", "en"] as const).map((locale) => (
          <button
            key={locale}
            type="button"
            role="tab"
            aria-selected={activeLocale === locale}
            onClick={() => setActiveLocale(locale)}
            className={
              activeLocale === locale ? "button-primary" : "button-secondary"
            }
          >
            {locale === "es" ? "Español" : "English"}
          </button>
        ))}
      </div>
      {taxonomy.categories.map((category) => (
        <div key={category.id} className="space-y-3 rounded-xl border p-4">
          <div className="flex gap-2">
            <input
              value={category.localizations[activeLocale]?.name ?? ""}
              placeholder={
                activeLocale === "en" ? category.localizations.es?.name : ""
              }
              onChange={(event) =>
                updateCategoryLabel(category, event.target.value)
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
                      localizations: {
                        es: {
                          slug: "subcategoria",
                          name: "Nueva subcategoría",
                        },
                      },
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
                value={subcategory.localizations[activeLocale]?.name ?? ""}
                placeholder={
                  activeLocale === "en"
                    ? subcategory.localizations.es?.name
                    : ""
                }
                onChange={(event) =>
                  updateCategory(category.id, {
                    subcategories: category.subcategories.map((item) =>
                      item.id === subcategory.id
                        ? {
                            ...item,
                            ...(activeLocale === "es"
                              ? { name: event.target.value }
                              : {}),
                            localizations: updateLocalizedTaxonomyName(
                              item.localizations,
                              activeLocale,
                              event.target.value,
                            ),
                          }
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
    schemaVersion: 2,
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

function localizedMetadata(metadata: DocumentMetadata) {
  const { order: _order, ...localized } = metadata;
  return localized;
}
