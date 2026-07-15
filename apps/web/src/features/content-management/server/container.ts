import "server-only";

import { VercelBlobContentRepository } from "../infrastructure/vercel-blob/vercel-blob-repository";

let repository: VercelBlobContentRepository | undefined;

export function getContentRepository(): VercelBlobContentRepository {
  repository ??= new VercelBlobContentRepository();
  return repository;
}
