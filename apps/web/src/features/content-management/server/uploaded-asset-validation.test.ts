import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const blobMocks = vi.hoisted(() => ({
  head: vi.fn(),
}));

vi.mock("@vercel/blob", () => blobMocks);

const originalBlobToken = process.env.BLOB_READ_WRITE_TOKEN;

import {
  type UploadedAssetClaim,
  validateUploadedAssets,
} from "./uploaded-asset-validation";

describe("validateUploadedAssets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalBlobToken === undefined) {
      delete process.env.BLOB_READ_WRITE_TOKEN;
    } else {
      process.env.BLOB_READ_WRITE_TOKEN = originalBlobToken;
    }
  });

  it("valida un upload nuevo con la misma credencial del client upload", async () => {
    const { asset } = await cssAsset();
    blobMocks.head.mockResolvedValue({
      url: asset.url,
      pathname: asset.pathname,
      size: asset.size,
      contentType: asset.contentType,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("body{color:#fff}")),
    );

    const result = await validateUploadedAssets([asset], [asset.pathname]);

    expect(result).toHaveLength(1);
    expect(blobMocks.head).toHaveBeenCalledTimes(1);
    expect(blobMocks.head).toHaveBeenCalledWith(asset.pathname, {
      token: "vercel_blob_rw_test",
    });
  });

  it("usa la URL canónica del store aunque el navegador envíe otra URL", async () => {
    const { asset } = await cssAsset();
    const canonicalUrl = asset.url.replace("store.", "canonical.");
    blobMocks.head.mockResolvedValue({
      url: canonicalUrl,
      pathname: asset.pathname,
      size: asset.size,
      contentType: asset.contentType,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("body{color:#fff}")),
    );

    const [result] = await validateUploadedAssets([asset], [asset.pathname]);

    expect(result?.url).toBe(canonicalUrl);
    expect(fetch).toHaveBeenCalledWith(canonicalUrl, { cache: "no-store" });
  });

  it("devuelve un error de entrada útil cuando la metadata no coincide", async () => {
    const { asset } = await cssAsset();
    blobMocks.head.mockResolvedValue({
      url: asset.url,
      pathname: asset.pathname,
      size: asset.size + 1,
      contentType: asset.contentType,
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      validateUploadedAssets([asset], [asset.pathname]),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message:
        "No se pudo validar una imagen subida. Vuelve a importar el documento.",
    });

    expect(consoleError).toHaveBeenCalledWith(
      "[content-management] uploaded asset metadata mismatch",
      expect.objectContaining({
        pathname: asset.pathname,
        expectedSize: asset.size,
        actualSize: asset.size + 1,
      }),
    );
    consoleError.mockRestore();
  });

  it("reutiliza un asset firmado sin uploads ni validaciones remotas", async () => {
    const { asset } = await cssAsset();

    const result = await validateUploadedAssets([asset], [], [asset]);

    expect(result).toEqual([
      expect.objectContaining({
        pathname: asset.pathname,
        sha256: asset.sha256,
      }),
    ]);
    expect(blobMocks.head).not.toHaveBeenCalled();
  });
});

async function cssAsset(): Promise<{
  asset: UploadedAssetClaim;
  bytes: Uint8Array;
}> {
  const bytes = new TextEncoder().encode("body{color:#fff}");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const pathname = "aws-labs/v1/documents/laboratorio-abc123/assets/styles.css";
  return {
    bytes,
    asset: {
      index: 0,
      placeholder: null,
      originalName: "styles.css",
      relativePath: "styles.css",
      pathname,
      url: `https://store.public.blob.vercel-storage.com/${pathname}`,
      contentType: "text/css",
      size: bytes.byteLength,
      sha256,
    },
  };
}
