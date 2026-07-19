const documentStatusFilterStorageKey =
  "felipe-labs.admin.documents.status-filter";

export const documentStatusFilters = [
  "all",
  "draft",
  "published",
  "trashed",
] as const;

export type DocumentStatusFilter = (typeof documentStatusFilters)[number];

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

export function browserAdminPreferenceStorage(): PreferenceStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readDocumentStatusFilter(
  storage: PreferenceStorage | null,
): DocumentStatusFilter {
  if (!storage) return "all";
  try {
    const stored = storage.getItem(documentStatusFilterStorageKey);
    return isDocumentStatusFilter(stored) ? stored : "all";
  } catch {
    return "all";
  }
}

export function persistDocumentStatusFilter(
  storage: PreferenceStorage | null,
  status: DocumentStatusFilter,
) {
  if (!storage) return;
  try {
    storage.setItem(documentStatusFilterStorageKey, status);
  } catch {
    // El filtro sigue funcionando durante la sesión si el navegador bloquea el almacenamiento.
  }
}

export function isDocumentStatusFilter(
  value: string | null,
): value is DocumentStatusFilter {
  return documentStatusFilters.some((filter) => filter === value);
}
