import path from "node:path";

import { generateFixtures } from "../../scripts/generate-fixtures.ts";

const GENERATED_FIXTURES_DIR = path.resolve(
  process.cwd(),
  "tests",
  "fixtures",
  "generated",
);

let generationPromise: Promise<void> | null = null;

export function generatedFixturePath(filename: string): string {
  return path.join(GENERATED_FIXTURES_DIR, filename);
}

export async function ensureGeneratedFixtures(): Promise<void> {
  if (!generationPromise) {
    generationPromise = generateFixtures(GENERATED_FIXTURES_DIR);
  }

  await generationPromise;
}
