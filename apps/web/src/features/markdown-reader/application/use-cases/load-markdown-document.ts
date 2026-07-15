import type { MarkdownDocument } from "../../domain/entities/markdown-document";
import { MarkdownLoaderError } from "../../domain/errors/markdown-loader-error";
import type { MarkdownFile } from "../ports/markdown-file";
import type { MarkdownParser } from "../ports/markdown-parser";

export type MarkdownLoaderPolicy = {
  allowedExtensions: readonly string[];
  maxFileSizeBytes: number;
};

export const defaultMarkdownLoaderPolicy: MarkdownLoaderPolicy = {
  allowedExtensions: [".md", ".markdown"],
  maxFileSizeBytes: 2 * 1024 * 1024,
};

export class LoadMarkdownDocument {
  constructor(
    private readonly parser: MarkdownParser,
    private readonly policy: MarkdownLoaderPolicy = defaultMarkdownLoaderPolicy,
  ) {}

  async execute(file: MarkdownFile): Promise<MarkdownDocument> {
    this.validate(file);

    let source: string;
    try {
      source = await file.text();
    } catch (cause) {
      throw new MarkdownLoaderError(
        "FILE_READ_FAILED",
        `No fue posible leer el archivo "${file.name}".`,
        { cause },
      );
    }

    const normalizedSource = source.replace(/^\uFEFF/, "");

    try {
      return {
        name: file.name,
        size: file.size,
        mimeType: file.type,
        source: normalizedSource,
        blocks: this.parser.parse(normalizedSource),
      };
    } catch (cause) {
      throw new MarkdownLoaderError(
        "MARKDOWN_PARSE_FAILED",
        `No fue posible interpretar el archivo "${file.name}".`,
        { cause },
      );
    }
  }

  private validate(file: MarkdownFile): void {
    const normalizedName = file.name.toLowerCase();
    const hasAllowedExtension = this.policy.allowedExtensions.some(
      (extension) => normalizedName.endsWith(extension.toLowerCase()),
    );

    if (!hasAllowedExtension) {
      throw new MarkdownLoaderError(
        "INVALID_FILE_EXTENSION",
        `El archivo "${file.name}" no tiene una extensión Markdown permitida.`,
      );
    }

    if (file.size > this.policy.maxFileSizeBytes) {
      throw new MarkdownLoaderError(
        "FILE_TOO_LARGE",
        `El archivo "${file.name}" supera el límite de ${this.policy.maxFileSizeBytes} bytes.`,
      );
    }
  }
}
