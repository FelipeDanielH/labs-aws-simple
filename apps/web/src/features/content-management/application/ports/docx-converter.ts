export type ConvertedDocxAsset = {
  index: number;
  placeholder: string;
  blob: Blob;
  contentType: string;
  extension: string;
  sha256: string;
};

export type ConvertedDocx = {
  markdown: string;
  assets: ConvertedDocxAsset[];
  warnings: string[];
};

export interface DocxConverter {
  convert(file: File): Promise<ConvertedDocx>;
}
