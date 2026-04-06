import fs from "node:fs";
import path from "node:path";

import type { QueryFileInput } from "@/lib/csvToSqlite";

const fixturesDirectory = path.resolve(process.cwd(), "test-fixtures");

export function fixturePath(filename: string): string {
  return path.join(fixturesDirectory, filename);
}

export function readFixtureText(filename: string): string {
  return fs.readFileSync(fixturePath(filename), "utf8");
}

export function readFixtureBuffer(filename: string): Buffer {
  return fs.readFileSync(fixturePath(filename));
}

export function makeFixtureQueryFile(filename: string): QueryFileInput {
  return {
    buffer: readFixtureBuffer(filename),
    filename,
  };
}

export function makeFixtureUpload(
  filename: string,
  type = "text/csv",
): File {
  return new File([Uint8Array.from(readFixtureBuffer(filename))], filename, {
    type,
  });
}
