import { z } from "zod";

const scalarSchema = z.union([z.string(), z.number(), z.boolean()]);
const metadataValueSchema = z.union([scalarSchema, z.array(scalarSchema)]);
const localeSchema = z.enum(["es", "en"]);

export const metadataSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(1000).default(""),
  author: z.string().trim().max(120).default(""),
  tags: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  order: z.number().int().nullable().default(null),
  extra: z.record(z.string().min(1).max(80), metadataValueSchema).default({}),
});

export const localizedMetadataSchema = metadataSchema.omit({ order: true });

export const uploadedAssetSchema = z.object({
  index: z.number().int().min(0).max(199),
  placeholder: z
    .string()
    .regex(/^__DOCX_ASSET_\d+__$/)
    .nullable(),
  originalName: z.string().min(1).max(255),
  relativePath: z.string().min(1).max(1000),
  pathname: z.string().min(1),
  url: z.url(),
  contentType: z.string().min(1).max(100),
  size: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

const variantSchema = z.object({
  locale: localeSchema,
  originalFileName: z.string().min(1).max(255),
  contentKind: z.enum(["docx", "markdown", "html"]),
  source: z.string().max(2 * 1024 * 1024),
  metadata: localizedMetadataSchema,
});

export const createDocumentSchema = z
  .object({
    intentToken: z.string().min(1),
    variants: z.array(variantSchema).min(1).max(2),
    assets: z.array(uploadedAssetSchema).max(200),
    order: z.number().int().nullable(),
    categoryId: z.string().nullable(),
    subcategoryId: z.string().nullable(),
  })
  .superRefine((value, context) => {
    if (!value.variants.some((variant) => variant.locale === "es")) {
      context.addIssue({
        code: "custom",
        path: ["variants"],
        message: "La versión en español es obligatoria.",
      });
    }
    if (
      new Set(value.variants.map((variant) => variant.locale)).size !==
      value.variants.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["variants"],
        message: "No se puede repetir un idioma.",
      });
    }
  });

export const updateDocumentSchema = z.object({
  locale: localeSchema,
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  originalFileName: z.string().min(1).max(255).optional(),
  contentKind: z.enum(["markdown", "html"]).optional(),
  source: z.string().max(2 * 1024 * 1024),
  metadata: localizedMetadataSchema,
  order: z.number().int().nullable(),
  categoryId: z.string().nullable(),
  subcategoryId: z.string().nullable(),
  expectedEtag: z.string().min(1),
});

const labelSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().regex(/^[a-z0-9-]+$/),
});
const localizationsSchema = z.object({
  es: labelSchema,
  en: labelSchema.optional(),
});

export const taxonomySchema = z
  .object({
    schemaVersion: z.literal(2),
    updatedAt: z.iso.datetime(),
    categories: z.array(
      z.object({
        id: z.string().min(1),
        localizations: localizationsSchema,
        name: z.string().trim().min(1).max(120),
        slug: z.string().regex(/^[a-z0-9-]+$/),
        subcategories: z.array(
          z.object({
            id: z.string().min(1),
            localizations: localizationsSchema,
            name: z.string().trim().min(1).max(120),
            slug: z.string().regex(/^[a-z0-9-]+$/),
          }),
        ),
      }),
    ),
  })
  .superRefine((taxonomy, context) => {
    for (const locale of ["es", "en"] as const) {
      const categorySlugs = new Set<string>();
      taxonomy.categories.forEach((category, categoryIndex) => {
        const label = category.localizations[locale];
        if (label) {
          if (categorySlugs.has(label.slug)) {
            context.addIssue({
              code: "custom",
              path: [
                "categories",
                categoryIndex,
                "localizations",
                locale,
                "slug",
              ],
              message: `El slug de categoría ya existe en ${locale.toUpperCase()}.`,
            });
          }
          categorySlugs.add(label.slug);
        }

        const subcategorySlugs = new Set<string>();
        category.subcategories.forEach((subcategory, subcategoryIndex) => {
          const subcategoryLabel = subcategory.localizations[locale];
          if (!subcategoryLabel) return;
          if (subcategorySlugs.has(subcategoryLabel.slug)) {
            context.addIssue({
              code: "custom",
              path: [
                "categories",
                categoryIndex,
                "subcategories",
                subcategoryIndex,
                "localizations",
                locale,
                "slug",
              ],
              message: `El slug de subcategoría ya existe en ${locale.toUpperCase()}.`,
            });
          }
          subcategorySlugs.add(subcategoryLabel.slug);
        });
      });
    }
  });
