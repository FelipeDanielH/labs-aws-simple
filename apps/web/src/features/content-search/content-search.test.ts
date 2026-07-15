import { describe, expect, it } from "vitest";

import {
  createLocalContentSearch,
  mapMarkdownToSearchableContent,
} from "./index";
import type { SearchableContent } from "./domain/entities/searchable-content";
import { RemarkMarkdownParser } from "@/features/markdown-reader/infrastructure/parsers/remark-markdown-parser";

const documents: SearchableContent[] = [
  {
    id: "lab-serverless",
    kind: "laboratory",
    title: "Laboratorio Serverless con Lambda",
    summary: "Construcción de una API sin servidores en AWS.",
    content: "Lambda API Gateway DynamoDB arquitectura serverless",
    tags: ["aws", "serverless"],
    categoryIds: ["aws-compute"],
    hierarchy: {
      parentId: "aws-compute",
      ancestorIds: ["cloud", "aws", "aws-compute"],
      path: ["Cloud", "AWS", "Compute"],
    },
    attributes: { difficulty: "introductorio" },
    order: 1,
  },
  {
    id: "deliverable-1",
    kind: "deliverable",
    title: "Entregable 1: diseño de la API",
    summary: "Diagrama y decisiones iniciales.",
    content: "Diseñar endpoints, contratos y arquitectura de la API.",
    tags: ["aws", "api"],
    categoryIds: ["aws-compute"],
    hierarchy: {
      parentId: "lab-serverless",
      ancestorIds: ["cloud", "aws", "aws-compute", "lab-serverless"],
      path: ["Cloud", "AWS", "Compute", "Laboratorio Serverless"],
    },
    attributes: { deliverable: 1, status: "published" },
    order: 1,
  },
  {
    id: "deliverable-2",
    kind: "deliverable",
    title: "Entregable 2: implementación",
    summary: "Código de funciones Lambda.",
    content: "Implementar funciones y persistencia con DynamoDB.",
    tags: ["aws", "lambda"],
    categoryIds: ["aws-compute"],
    hierarchy: {
      parentId: "lab-serverless",
      ancestorIds: ["cloud", "aws", "aws-compute", "lab-serverless"],
      path: ["Cloud", "AWS", "Compute", "Laboratorio Serverless"],
    },
    attributes: { deliverable: 2, status: "draft" },
    order: 2,
  },
];

describe("content search", () => {
  it("busca por prefijo y tolera errores tipográficos", async () => {
    const contentSearch = createLocalContentSearch();
    await contentSearch.manage.replaceAll(documents);

    const prefix = await contentSearch.search.execute({ text: "lamb" });
    const fuzzy = await contentSearch.search.execute({ text: "serverles" });

    expect(prefix.hits.map((hit) => hit.document.id)).toContain(
      "lab-serverless",
    );
    expect(fuzzy.hits[0]?.document.id).toBe("lab-serverless");
  });

  it("combina jerarquía, tipo y atributos sin requerir texto", async () => {
    const contentSearch = createLocalContentSearch();
    await contentSearch.manage.replaceAll(documents);

    const result = await contentSearch.search.execute({
      filters: {
        kinds: ["deliverable"],
        ancestorIds: ["lab-serverless"],
        attributes: { deliverable: 2 },
      },
    });

    expect(result.total).toBe(1);
    expect(result.hits[0]?.document.id).toBe("deliverable-2");
    expect(result.facets.kinds).toEqual({ deliverable: 1 });
  });

  it("actualiza y elimina documentos incrementalmente", async () => {
    const contentSearch = createLocalContentSearch();
    await contentSearch.manage.replaceAll(documents);
    await contentSearch.manage.upsert([
      { ...documents[2], title: "Entregable 2: despliegue productivo" },
    ]);

    const updated = await contentSearch.search.execute({ text: "productivo" });
    expect(updated.hits[0]?.document.id).toBe("deliverable-2");

    await contentSearch.manage.remove(["deliverable-2"]);
    const removed = await contentSearch.search.execute({ text: "productivo" });
    expect(removed.total).toBe(0);
  });

  it("convierte documentos Markdown al contrato indexable", () => {
    const source = "# Laboratorio S3\n\nPublicar un sitio estático en AWS.";
    const document = mapMarkdownToSearchableContent(
      {
        name: "s3.md",
        size: source.length,
        mimeType: "text/markdown",
        source,
        blocks: new RemarkMarkdownParser().parse(source),
      },
      {
        id: "lab-s3",
        kind: "laboratory",
        categoryIds: ["aws-storage"],
        attributes: { deliverable: 1 },
      },
    );

    expect(document.title).toBe("Laboratorio S3");
    expect(document.summary).toBe("Publicar un sitio estático en AWS.");
    expect(document.content).toBe(source);
  });
});
