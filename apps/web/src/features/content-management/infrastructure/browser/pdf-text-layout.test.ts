import { describe, expect, it } from "vitest";

import {
  groupRunsIntoLines,
  pdfPageToMarkdown,
  type PdfTextRun,
} from "./pdf-text-layout";

describe("PDF text layout", () => {
  it("agrupa fragmentos en líneas respetando espacios visuales", () => {
    const lines = groupRunsIntoLines([
      run("AWS", 10, 100, 22, 12),
      run("Labs", 38, 100, 24, 12),
      run("Segunda línea", 10, 80, 80, 12),
    ]);

    expect(lines.map((line) => line.text)).toEqual([
      "AWS Labs",
      "Segunda línea",
    ]);
  });

  it("convierte encabezados, listas, páginas e imágenes a Markdown", () => {
    const result = pdfPageToMarkdown(
      2,
      [
        run("Laboratorio VPC", 10, 120, 100, 24),
        run("• Crear la VPC", 10, 90, 100, 12),
        run("Texto explicativo", 10, 60, 100, 12),
      ],
      [{ y: 45, placeholder: "__PDF_ASSET_0__", alt: "Diagrama" }],
    );

    expect(result.markdown).toContain("<!-- Página 2 -->");
    expect(result.markdown).toContain("# Laboratorio VPC");
    expect(result.markdown).toContain("- Crear la VPC");
    expect(result.markdown).toContain("![Diagrama](__PDF_ASSET_0__)");
  });

  it("advierte disposiciones probables en varias columnas", () => {
    const runs = Array.from({ length: 4 }, (_, index) => [
      run(`Izquierda ${index}`, 10, 120 - index * 20, 70, 12),
      run(`Derecha ${index}`, 300, 120 - index * 20, 70, 12),
    ]).flat();

    expect(pdfPageToMarkdown(1, runs, []).likelyColumns).toBe(true);
  });

  it("detecta filas repetidas con celdas separadas como tabla probable", () => {
    const runs = Array.from({ length: 3 }, (_, row) => [
      run(`Servicio ${row}`, 10, 120 - row * 20, 55, 12),
      run(`Región ${row}`, 110, 120 - row * 20, 50, 12),
      run(`Estado ${row}`, 210, 120 - row * 20, 50, 12),
    ]).flat();

    expect(pdfPageToMarkdown(1, runs, []).likelyTable).toBe(true);
  });
});

function run(
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
): PdfTextRun {
  return { text, x, y, width, height, hasEol: false };
}
