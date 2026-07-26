import { ImageKind, OPS, PDFWorker, getDocument } from "pdfjs-dist";

import type {
  ConvertedPdf,
  ConvertedPdfAsset,
  PdfConverter,
} from "../../application/ports/pdf-converter";
import {
  pdfPageToMarkdown,
  type PdfImagePlacement,
  type PdfTextRun,
} from "./pdf-text-layout";

const MAX_PDF_SIZE = 25 * 1024 * 1024;
const MAX_PDF_PAGES = 200;
const MAX_ASSET_COUNT = 200;
const MAX_ASSET_SIZE = 25 * 1024 * 1024;
const MAX_ASSET_TOTAL_SIZE = 100 * 1024 * 1024;
const MIN_TEXT_CHARACTERS = 50;
const MIN_RASTER_DIMENSION = 32;
const IMAGE_OBJECT_TIMEOUT_MS = 10_000;

type Matrix = [number, number, number, number, number, number];

type PdfImageData = {
  width: number;
  height: number;
  kind?: number;
  data?: Uint8Array | Uint8ClampedArray;
  bitmap?: ImageBitmap;
};

type PdfObjectStore = {
  has(id: string): boolean;
  get(id: string, callback?: (value: PdfImageData | null) => void): unknown;
};

type PdfPage = {
  view: number[];
  objs: PdfObjectStore;
  commonObjs: PdfObjectStore;
  getTextContent(): Promise<{
    items: Array<
      | {
          str: string;
          transform: number[];
          width: number;
          height: number;
          hasEOL: boolean;
        }
      | { type: string }
    >;
  }>;
  getOperatorList(): Promise<{
    fnArray: number[];
    argsArray: unknown[][];
  }>;
  cleanup(): boolean;
};

type ExtractedImage = {
  data: PdfImageData;
  y: number;
};

export class PdfJsPdfConverter implements PdfConverter {
  async convert(file: File, signal?: AbortSignal): Promise<ConvertedPdf> {
    validatePdf(file);
    signal?.throwIfAborted();
    const workerPort = new Worker(
      new URL("./pdf-js.worker.ts", import.meta.url),
    );
    const pdfWorker = PDFWorker.fromPort({ port: workerPort }) as PDFWorker;
    const loadingTask = getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      worker: pdfWorker,
      isEvalSupported: false,
      stopAtErrors: true,
    });
    const cancelConversion = () => {
      void loadingTask.destroy();
      workerPort.terminate();
    };
    signal?.addEventListener("abort", cancelConversion, { once: true });
    let passwordProtected = false;
    loadingTask.onPassword = () => {
      passwordProtected = true;
      void loadingTask.destroy();
    };

    try {
      const document = await loadingTask.promise;
      if (document.numPages > MAX_PDF_PAGES) {
        throw new Error(`El PDF supera el límite de ${MAX_PDF_PAGES} páginas.`);
      }

      const assets: ConvertedPdfAsset[] = [];
      const assetBySha = new Map<string, ConvertedPdfAsset>();
      const warnings = new Set<string>();
      const pageMarkdown: string[] = [];
      let totalTextCharacters = 0;
      let totalAssetBytes = 0;
      let omittedSmallImages = 0;

      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        signal?.throwIfAborted();
        const page = (await document.getPage(pageNumber)) as unknown as PdfPage;
        try {
          const textContent = await page.getTextContent();
          const runs = textRuns(textContent.items);
          const pageCharacters = runs.reduce(
            (total, run) => total + run.text.replace(/\s/gu, "").length,
            0,
          );
          totalTextCharacters += pageCharacters;
          if (pageCharacters < 10) {
            warnings.add(
              `La página ${pageNumber} contiene poco o ningún texto seleccionable.`,
            );
          }

          const { images, containsVectorGraphics } =
            await extractPageImages(page);
          if (containsVectorGraphics) {
            warnings.add(
              "El PDF contiene gráficos vectoriales que no se pueden extraer como imágenes; revisa la vista previa.",
            );
          }

          const placements: PdfImagePlacement[] = [];
          for (const image of images) {
            signal?.throwIfAborted();
            if (
              image.data.width < MIN_RASTER_DIMENSION &&
              image.data.height < MIN_RASTER_DIMENSION
            ) {
              omittedSmallImages += 1;
              continue;
            }
            const blob = await pdfImageToPng(image.data);
            if (!blob) {
              warnings.add(
                `No fue posible convertir una imagen de la página ${pageNumber}.`,
              );
              continue;
            }
            if (blob.size > MAX_ASSET_SIZE) {
              throw new Error(
                `Una imagen extraída de la página ${pageNumber} supera 25 MiB.`,
              );
            }
            const sha256 = await digestHex(await blob.arrayBuffer());
            let asset = assetBySha.get(sha256);
            if (!asset) {
              if (assets.length >= MAX_ASSET_COUNT) {
                throw new Error(
                  `El PDF supera el límite de ${MAX_ASSET_COUNT} imágenes únicas.`,
                );
              }
              if (totalAssetBytes + blob.size > MAX_ASSET_TOTAL_SIZE) {
                throw new Error(
                  "Las imágenes extraídas del PDF superan 100 MiB.",
                );
              }
              const index = assets.length;
              asset = {
                index,
                placeholder: `__PDF_ASSET_${index}__`,
                blob,
                contentType: "image/png",
                extension: "png",
                sha256,
              };
              assets.push(asset);
              assetBySha.set(sha256, asset);
              totalAssetBytes += blob.size;
            }
            placements.push({
              y: image.y,
              placeholder: asset.placeholder,
              alt: `Imagen extraída de la página ${pageNumber}`,
            });
          }

          const layout = pdfPageToMarkdown(pageNumber, runs, placements);
          if (layout.likelyColumns) {
            warnings.add(
              `La página ${pageNumber} parece usar varias columnas; revisa el orden del texto.`,
            );
          }
          if (layout.likelyTable) {
            warnings.add(
              `La página ${pageNumber} parece contener una tabla; revisa su estructura en Markdown.`,
            );
          }
          pageMarkdown.push(layout.markdown);
        } finally {
          page.cleanup();
        }
      }

      if (totalTextCharacters < MIN_TEXT_CHARACTERS) {
        throw new Error(
          "No se detectó suficiente texto seleccionable. Usa un PDF digital o aplica OCR antes de importarlo.",
        );
      }
      if (omittedSmallImages) {
        warnings.add(
          `Se omitieron ${omittedSmallImages} imágenes decorativas menores de ${MIN_RASTER_DIMENSION} × ${MIN_RASTER_DIMENSION} píxeles.`,
        );
      }

      return {
        markdown: `${pageMarkdown
          .join("\n")
          .replace(/\n{3,}/gu, "\n\n")
          .trim()}\n`,
        assets,
        warnings: [...warnings],
      };
    } catch (error) {
      if (signal?.aborted) {
        throw new DOMException(
          "La conversión PDF fue cancelada.",
          "AbortError",
        );
      }
      if (passwordProtected) {
        throw new Error(
          "El PDF está protegido con contraseña. Usa una copia desbloqueada.",
        );
      }
      if (error instanceof Error && error.message) throw error;
      throw new Error("No fue posible interpretar el PDF.");
    } finally {
      signal?.removeEventListener("abort", cancelConversion);
      await loadingTask.destroy().catch(() => undefined);
      workerPort.terminate();
    }
  }
}

function validatePdf(file: File) {
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Selecciona un archivo .pdf válido.");
  }
  if (file.type && file.type !== "application/pdf") {
    throw new Error("El archivo seleccionado no tiene un tipo PDF válido.");
  }
  if (file.size > MAX_PDF_SIZE) {
    throw new Error("El PDF supera el límite de 25 MiB.");
  }
}

function textRuns(
  items: Awaited<ReturnType<PdfPage["getTextContent"]>>["items"],
) {
  return items.flatMap<PdfTextRun>((item) => {
    if (!("str" in item) || !item.str.trim()) return [];
    const transform = item.transform;
    const height =
      item.height ||
      Math.hypot(transform[2] ?? 0, transform[3] ?? 0) ||
      Math.hypot(transform[0] ?? 0, transform[1] ?? 0);
    return [
      {
        text: item.str,
        x: transform[4] ?? 0,
        y: transform[5] ?? 0,
        width: item.width,
        height,
        hasEol: item.hasEOL,
      },
    ];
  });
}

async function extractPageImages(page: PdfPage): Promise<{
  images: ExtractedImage[];
  containsVectorGraphics: boolean;
}> {
  const operators = await page.getOperatorList();
  const images: ExtractedImage[] = [];
  const stack: Matrix[] = [];
  let matrix: Matrix = [1, 0, 0, 1, 0, 0];
  let containsVectorGraphics = false;

  for (let index = 0; index < operators.fnArray.length; index++) {
    const operation = operators.fnArray[index];
    const args = operators.argsArray[index] ?? [];
    if (operation === OPS.save) {
      stack.push([...matrix]);
    } else if (operation === OPS.restore) {
      matrix = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    } else if (operation === OPS.transform && args.length >= 6) {
      matrix = multiplyMatrix(matrix, args.slice(0, 6) as Matrix);
    } else if (operation === OPS.constructPath) {
      containsVectorGraphics = true;
    } else if (operation === OPS.paintInlineImageXObject) {
      const data = args[0] as PdfImageData | undefined;
      if (data) images.push({ data, y: transformedTop(matrix) });
    } else if (operation === OPS.paintImageXObject) {
      const id = args[0];
      if (typeof id !== "string") continue;
      const data = await resolveImageObject(page, id);
      if (data) images.push({ data, y: transformedTop(matrix) });
    } else if (operation === OPS.paintImageXObjectRepeat) {
      const id = args[0];
      const scaleX = Number(args[1]);
      const scaleY = Number(args[2]);
      const positions = numericArray(args[3]);
      if (
        typeof id !== "string" ||
        !Number.isFinite(scaleX) ||
        !Number.isFinite(scaleY) ||
        !positions
      ) {
        continue;
      }
      const data = await resolveImageObject(page, id);
      if (!data) continue;
      for (let position = 0; position + 1 < positions.length; position += 2) {
        const imageMatrix = multiplyMatrix(matrix, [
          scaleX,
          0,
          0,
          scaleY,
          Number(positions[position]),
          Number(positions[position + 1]),
        ]);
        images.push({ data, y: transformedTop(imageMatrix) });
      }
    }
  }

  return { images, containsVectorGraphics };
}

function numericArray(value: unknown): number[] | null {
  if (Array.isArray(value)) return value.map(Number);
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    return Array.from(value as unknown as ArrayLike<number>, Number);
  }
  return null;
}

async function resolveImageObject(
  page: PdfPage,
  id: string,
): Promise<PdfImageData | null> {
  const store = id.startsWith("g_") ? page.commonObjs : page.objs;
  if (store.has(id)) return store.get(id) as PdfImageData | null;
  return new Promise((resolve) => {
    const timeout = window.setTimeout(
      () => resolve(null),
      IMAGE_OBJECT_TIMEOUT_MS,
    );
    store.get(id, (value) => {
      window.clearTimeout(timeout);
      resolve(value);
    });
  });
}

async function pdfImageToPng(image: PdfImageData): Promise<Blob | null> {
  if (!image.width || !image.height) return null;
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) return null;

  try {
    if (image.bitmap) {
      context.drawImage(image.bitmap, 0, 0);
    } else if (image.data) {
      const output = context.createImageData(image.width, image.height);
      if (image.kind === ImageKind.RGBA_32BPP) {
        output.data.set(image.data);
      } else if (image.kind === ImageKind.RGB_24BPP) {
        for (
          let source = 0, target = 0;
          source + 2 < image.data.length;
          source += 3, target += 4
        ) {
          output.data[target] = image.data[source]!;
          output.data[target + 1] = image.data[source + 1]!;
          output.data[target + 2] = image.data[source + 2]!;
          output.data[target + 3] = 255;
        }
      } else if (image.kind === ImageKind.GRAYSCALE_1BPP) {
        unpackGrayscale(image.data, output.data, image.width, image.height);
      } else if (image.data.length === output.data.length) {
        output.data.set(image.data);
      } else {
        return null;
      }
      context.putImageData(output, 0, 0);
    } else {
      return null;
    }

    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

function unpackGrayscale(
  source: Uint8Array | Uint8ClampedArray,
  target: Uint8ClampedArray,
  width: number,
  height: number,
) {
  const bytesPerRow = Math.ceil(width / 8);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const byte = source[y * bytesPerRow + Math.floor(x / 8)] ?? 0;
      const white = Boolean(byte & (1 << (7 - (x % 8))));
      const offset = (y * width + x) * 4;
      const value = white ? 255 : 0;
      target[offset] = value;
      target[offset + 1] = value;
      target[offset + 2] = value;
      target[offset + 3] = 255;
    }
  }
}

function multiplyMatrix(left: Matrix, right: Matrix): Matrix {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}

function transformedTop(matrix: Matrix): number {
  const bottomLeft = matrix[5];
  const topLeft = matrix[3] + matrix[5];
  const bottomRight = matrix[1] + matrix[5];
  const topRight = matrix[1] + matrix[3] + matrix[5];
  return Math.max(bottomLeft, topLeft, bottomRight, topRight);
}

async function digestHex(value: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
