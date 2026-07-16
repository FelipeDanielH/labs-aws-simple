export function assertAssetSignature(
  bytes: Uint8Array,
  contentType: string,
  fileName: string,
): void {
  const ascii = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const starts = (...values: number[]) =>
    values.every((value, index) => bytes[index] === value);
  const valid =
    contentType === "image/png"
      ? starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
      : contentType === "image/jpeg"
        ? starts(0xff, 0xd8, 0xff)
        : contentType === "image/gif"
          ? /^GIF8[79]a/.test(ascii)
          : contentType === "image/webp"
            ? ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP"
            : contentType === "image/avif"
              ? ascii.slice(4, 12).startsWith("ftypavi")
              : contentType === "image/svg+xml"
                ? /<svg(?:\s|>)/i.test(ascii)
                : contentType === "text/css"
                  ? !ascii.includes("\u0000")
                  : contentType === "font/woff" ||
                      contentType === "application/font-woff"
                    ? ascii.startsWith("wOFF")
                    : contentType === "font/woff2"
                      ? ascii.startsWith("wOF2")
                      : contentType === "font/otf"
                        ? ascii.startsWith("OTTO")
                        : contentType === "font/ttf" ||
                            contentType === "application/font-sfnt"
                          ? starts(0x00, 0x01, 0x00, 0x00) ||
                            ascii.startsWith("true")
                          : false;
  if (!valid) {
    throw new Error(`${fileName} no coincide con su tipo de archivo.`);
  }
}
