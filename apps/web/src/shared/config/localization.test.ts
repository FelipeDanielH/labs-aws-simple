import { describe, expect, it } from "vitest";

import { localeFromPathname } from "./locale-routing";
import { messages } from "./translations";

describe("localized public navigation", () => {
  it("uses the locale in the URL ahead of the persisted preference", () => {
    expect(localeFromPathname("/en/laboratorios", "es")).toBe("en");
    expect(localeFromPathname("/es/laboratorios", "en")).toBe("es");
  });

  it("preserves the preference on routes without a locale", () => {
    expect(localeFromPathname("/admin", "en")).toBe("en");
  });

  it("provides English labels for the laboratories catalog", () => {
    expect(messages.en.laboratoriesPage).toMatchObject({
      categoriesTitle: "Categories",
      allLaboratories: "All laboratories",
      searchPlaceholder: "Search by name",
      perPage: "Per page",
    });
    expect(messages.en.laboratoryDetail.onThisPage).toBe("On this page");
  });
});
