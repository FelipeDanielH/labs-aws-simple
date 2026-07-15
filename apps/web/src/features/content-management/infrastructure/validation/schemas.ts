import { z } from "zod";

const scalarSchema = z.union([z.string(), z.number(), z.boolean()]);
const metadataValueSchema = z.union([scalarSchema, z.array(scalarSchema)]);

export const metadataSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(1000).default(""),
  author: z.string().trim().max(120).default(""),
  tags: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  order: z.number().int().nullable().default(null),
  extra: z.record(z.string().min(1).max(80), metadataValueSchema).default({}),
});

export const uploadedAssetSchema = z.object({
  index: z.number().int().min(0).max(99),
  placeholder: z.string().regex(/^__DOCX_ASSET_\d+__$/),
  originalName: z.string().min(1).max(255),
  pathname: z.string().min(1),
  url: z.url(),
  contentType: z.string().regex(/^image\//),
  size: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const createDocumentSchema = z.object({
  intentToken: z.string().min(1),
  originalFileName: z.string().min(1).max(255),
  markdown: z.string().max(2 * 1024 * 1024),
  assets: z.array(uploadedAssetSchema).max(100),
  metadata: metadataSchema,
  categoryId: z.string().nullable(),
  subcategoryId: z.string().nullable(),
});

export const updateDocumentSchema = z.object({
  markdown: z.string().max(2 * 1024 * 1024),
  metadata: metadataSchema,
  categoryId: z.string().nullable(),
  subcategoryId: z.string().nullable(),
  expectedEtag: z.string().min(1),
});

export const taxonomySchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: z.iso.datetime(),
  categories: z.array(
    z.object({
      id: z.string().min(1),
      slug: z.string().regex(/^[a-z0-9-]+$/),
      name: z.string().trim().min(1).max(120),
      subcategories: z.array(
        z.object({
          id: z.string().min(1),
          slug: z.string().regex(/^[a-z0-9-]+$/),
          name: z.string().trim().min(1).max(120),
        }),
      ),
    }),
  ),
});
