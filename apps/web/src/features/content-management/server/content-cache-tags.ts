import type { ContentLocale } from "../domain/models";

const ROOT = "aws-labs";

export const contentCacheTags = {
  taxonomy: `${ROOT}:taxonomy`,
  adminDocuments: `${ROOT}:admin-documents`,
  catalog(locale: ContentLocale) {
    return `${ROOT}:catalog:${locale}`;
  },
  document(id: string) {
    return `${ROOT}:document:${id}`;
  },
};
