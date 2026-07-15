export type SearchAttributeScalar = string | number | boolean;
export type SearchAttributeValue =
  SearchAttributeScalar | readonly SearchAttributeScalar[];

export type ContentHierarchy = {
  parentId: string | null;
  ancestorIds: readonly string[];
  path: readonly string[];
};

export type SearchableContent = {
  id: string;
  kind: string;
  title: string;
  summary: string;
  content: string;
  tags: readonly string[];
  categoryIds: readonly string[];
  hierarchy: ContentHierarchy;
  attributes: Readonly<Record<string, SearchAttributeValue>>;
  order: number | null;
};
