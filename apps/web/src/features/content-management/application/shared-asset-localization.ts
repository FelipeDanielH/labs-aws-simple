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

export function missingSharedAssetReferences(
  references: string[],
  sharedAssets: LocalizedAssetReference[],
): string[] {
  const available = new Set(
    sharedAssets.flatMap((asset) => [
      normalizeSharedAssetReference(asset.relativePath),
      ...(asset.placeholder
        ? [normalizeSharedAssetReference(asset.placeholder)]
        : []),
    ]),
  );
  return references.filter(
    (reference) =>
      !available.has(normalizeSharedAssetReference(reference)),
  );
}

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
  for (const spanish of spanishAssets) {
    const target = uploaded.find(
      (candidate) => candidate.index === spanish.index,
    );
    if (!target) continue;
    const replacement = `./${target.relativePath}`;
    if (spanish.placeholder) {
      resolved = resolved.replaceAll(spanish.placeholder, replacement);
    }
    resolved = resolved
      .replaceAll(`./${spanish.relativePath}`, replacement)
      .replaceAll(spanish.relativePath, target.relativePath);
  }
  return resolved;
}

function normalizeSharedAssetReference(value: string): string {
  return value
    .split(/[?#]/u)[0]
    .replaceAll("\\", "/")
    .replace(/^\.\//u, "")
    .replace(/^assets\//u, "");
}
