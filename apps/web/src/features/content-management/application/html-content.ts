import type { Element, Root, RootContent } from "hast";
import rehypeParse from "rehype-parse";
import rehypeStringify from "rehype-stringify";
import { unified } from "unified";

import { normalizeRelativeAssetPath } from "./document-paths";

export type HtmlProcessingResult = {
  html: string;
  title: string | null;
  localReferences: string[];
  warnings: string[];
};

const REMOVED_ELEMENTS = new Set([
  "script",
  "object",
  "embed",
  "iframe",
  "base",
]);
const URL_ATTRIBUTES = new Set(["href", "src", "poster", "cite"]);

export function processHtmlContent(source: string): HtmlProcessingResult {
  const tree = unified().use(rehypeParse).parse(source) as Root;
  const localReferences = new Set<string>();
  const warnings = new Set<string>();
  let title: string | null = null;
  let firstHeading: string | null = null;

  function cleanChildren(children: RootContent[]): RootContent[] {
    const cleaned: RootContent[] = [];
    for (const node of children) {
      if (node.type !== "element") {
        cleaned.push(node);
        continue;
      }
      const element = node as Element;
      const tag = element.tagName.toLowerCase();
      if (REMOVED_ELEMENTS.has(tag)) {
        warnings.add(`Se eliminó <${tag}> por seguridad.`);
        continue;
      }
      if (
        tag === "meta" &&
        String(element.properties?.httpEquiv ?? "").toLowerCase() === "refresh"
      ) {
        warnings.add("Se eliminó una redirección meta refresh.");
        continue;
      }
      if (tag === "form") {
        element.tagName = "div";
        warnings.add("Los formularios se convirtieron en contenido estático.");
      }
      if (tag === "link") {
        const rel = propertyString(element, "rel").toLowerCase();
        if (!rel.split(/\s+/).includes("stylesheet")) {
          warnings.add(
            "Se eliminó un enlace <link> que no era una hoja de estilo.",
          );
          continue;
        }
      }

      for (const key of Object.keys(element.properties ?? {})) {
        const lower = key.toLowerCase();
        if (
          lower.startsWith("on") ||
          lower === "srcdoc" ||
          lower === "action" ||
          lower === "formaction"
        ) {
          delete element.properties[key];
          warnings.add(`Se eliminó el atributo ${key} por seguridad.`);
          continue;
        }
        if (URL_ATTRIBUTES.has(lower)) {
          const value = propertyString(element, key);
          if (!value) continue;
          const normalized = normalizeReference(value);
          if (normalized.kind === "blocked") {
            if (!/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value)) {
              throw new Error(
                `HTML contiene una ruta local no permitida: ${value}`,
              );
            }
            delete element.properties[key];
            warnings.add(`Se eliminó una URL no permitida: ${value}`);
          } else if (normalized.kind === "local") {
            element.properties[key] = normalized.value;
            localReferences.add(normalized.value);
          }
        }
        if (lower === "srcset") {
          const candidates = propertyString(element, key)
            .split(",")
            .map((candidate) => candidate.trim())
            .filter(Boolean)
            .map((candidate) => {
              const [url, ...descriptor] = candidate.split(/\s+/);
              const normalized = normalizeReference(url ?? "");
              if (normalized.kind === "blocked") {
                warnings.add(`Se eliminó una URL no permitida: ${url}`);
                return null;
              }
              if (normalized.kind === "local") {
                localReferences.add(normalized.value);
                return [normalized.value, ...descriptor].join(" ");
              }
              return candidate;
            })
            .filter((candidate): candidate is string => candidate !== null);
          if (candidates.length)
            element.properties[key] = candidates.join(", ");
          else delete element.properties[key];
        }
        if (lower === "style") {
          collectCssReferences(propertyString(element, key), localReferences);
        }
      }

      element.children = cleanChildren(
        element.children as RootContent[],
      ) as Element["children"];
      const text = textContent(element).trim();
      if (tag === "style") collectCssReferences(text, localReferences);
      if (tag === "title" && text) title ??= text;
      if (tag === "h1" && text) firstHeading ??= text;
      cleaned.push(element);
    }
    return cleaned;
  }

  tree.children = cleanChildren(tree.children);
  return {
    html: unified().use(rehypeStringify).stringify(tree),
    title: title ?? firstHeading,
    localReferences: [...localReferences],
    warnings: [...warnings],
  };
}

export function injectControlledBase(html: string, baseUrl: string): string {
  const base = `<base href="${escapeAttribute(baseUrl)}">`;
  return /<head(?:\s[^>]*)?>/i.test(html)
    ? html.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}${base}`)
    : `<!doctype html><html><head>${base}</head><body>${html}</body></html>`;
}

export function collectCssReferences(
  css: string,
  target = new Set<string>(),
  allowParentSegments = false,
): Set<string> {
  const matches = [
    ...css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi),
    ...css.matchAll(/@import\s+(?:url\(\s*)?(['"])(.*?)\1\s*\)?/gi),
  ];
  for (const match of matches) {
    const value = (match[2] ?? "").trim();
    if (!value) continue;
    if (allowParentSegments && /^(?:\.\.\/)+/u.test(value)) {
      target.add(value);
      continue;
    }
    const normalized = normalizeReference(value);
    if (normalized.kind === "local") target.add(normalized.value);
    if (normalized.kind === "blocked") {
      throw new Error(`CSS contiene una URL no permitida: ${value}`);
    }
  }
  return target;
}

export function normalizeReference(
  value: string,
):
  | { kind: "local"; value: string }
  | { kind: "external" }
  | { kind: "blocked" } {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("#")) return { kind: "external" };
  if (/^https:\/\//i.test(trimmed)) return { kind: "external" };
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(trimmed)) {
    return { kind: "blocked" };
  }
  const suffixIndex = trimmed.search(/[?#]/u);
  const pathname = suffixIndex >= 0 ? trimmed.slice(0, suffixIndex) : trimmed;
  const suffix = suffixIndex >= 0 ? trimmed.slice(suffixIndex) : "";
  try {
    const safe = normalizeRelativeAssetPath(pathname.replace(/^\/+/, ""));
    return { kind: "local", value: `${safe}${suffix}` };
  } catch {
    return { kind: "blocked" };
  }
}

function textContent(element: Element): string {
  return element.children
    .map((child) =>
      child.type === "text"
        ? child.value
        : child.type === "element"
          ? textContent(child)
          : "",
    )
    .join("");
}

function propertyString(element: Element, name: string): string {
  const value = element.properties?.[name];
  return Array.isArray(value) ? value.join(" ") : String(value ?? "");
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}
