import { beforeEach, describe, expect, it, vi } from "vitest";

const blobMocks = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock("@vercel/blob", () => blobMocks);

import {
  type UploadedAssetClaim,
  validateUploadedAssets,
} from "./uploaded-asset-validation";

describe("validateUploadedAssets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("valida un upload nuevo con una sola operación get", async () => {
    const { asset } = await cssAsset();
    blobMocks.get.mockResolvedValue({
      statusCode: 200,
      stream: new Response("body{color:#fff}").body!,
      blob: {
        url: asset.url,
        size: asset.size,
        contentType: asset.contentType,
      },
    });

    const result = await validateUploadedAssets([asset], [asset.pathname]);

    expect(result).toHaveLength(1);
    expect(blobMocks.get).toHaveBeenCalledTimes(1);
    expect(blobMocks.get).toHaveBeenCalledWith(asset.pathname, {
      access: "public",
      useCache: false,
    });
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
    expect(blobMocks.get).not.toHaveBeenCalled();
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
