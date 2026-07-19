import { describe, expect, it } from "vitest";

import {
  persistDocumentStatusFilter,
  readDocumentStatusFilter,
} from "./admin-preferences";

function memoryStorage(initial?: Record<string, string>) {
  const values = new Map(Object.entries(initial ?? {}));
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe("admin preferences", () => {
  it("restaura el filtro de documentos persistido", () => {
    const storage = memoryStorage();

    persistDocumentStatusFilter(storage, "draft");

    expect(readDocumentStatusFilter(storage)).toBe("draft");
  });

  it("usa todos cuando el valor guardado no es válido", () => {
    const storage = memoryStorage({
      "felipe-labs.admin.documents.status-filter": "unknown",
    });

    expect(readDocumentStatusFilter(storage)).toBe("all");
    expect(readDocumentStatusFilter(null)).toBe("all");
  });

  it("continúa funcionando si el almacenamiento está bloqueado", () => {
    const storage = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    };

    expect(readDocumentStatusFilter(storage)).toBe("all");
    expect(() => persistDocumentStatusFilter(storage, "published")).not.toThrow();
  });
});
