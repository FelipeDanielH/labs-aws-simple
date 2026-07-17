export type LocalizedAssetReference = {
  index: number;
  relativePath: string;
  sha256: string;
  placeholder: string | null;
};

export type SharedUploadedAsset = {
  index: number;
  relativePath: string;
  sha256: string;
};

export function resolveSharedAssetReferences(
  source: string,
  translatedAssets: LocalizedAssetReference[],
  spanishAssets: LocalizedAssetReference[],
  uploaded: SharedUploadedAsset[],
): string {
  let resolved = source;
  for (const asset of translatedAssets) {
    const spanish = spanishAssets.find(
      (candidate) => candidate.sha256 === asset.sha256,
    );
    if (!spanish) {
      throw new Error(
        `La traducción contiene un recurso nuevo: ${asset.relativePath}.`,
      );
    }
    const target = uploaded.find(
      (candidate) => candidate.index === spanish.index,
    );
    if (!target) {
      throw new Error("No se encontró el recurso español compartido.");
    }
    const replacement = `./${target.relativePath}`;
    if (asset.placeholder) {
      resolved = resolved.replaceAll(asset.placeholder, replacement);
    } else {
      resolved = resolved
        .replaceAll(`./${asset.relativePath}`, replacement)
        .replaceAll(asset.relativePath, target.relativePath);
    }
  }
  return resolved;
}
