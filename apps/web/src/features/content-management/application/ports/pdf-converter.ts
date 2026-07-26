export type ConvertedPdfAsset = {
  index: number;
  placeholder: string;
  blob: Blob;
  contentType: "image/png";
  extension: "png";
  sha256: string;
};

export type ConvertedPdf = {
  markdown: string;
  assets: ConvertedPdfAsset[];
  warnings: string[];
};

export interface PdfConverter {
  convert(file: File, signal?: AbortSignal): Promise<ConvertedPdf>;
}
