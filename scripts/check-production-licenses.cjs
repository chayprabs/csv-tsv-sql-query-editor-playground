/**
 * CI license gate aligned with PRD §21 (no GPL / AGPL / LGPL in production deps).
 *
 * Reads `package-lock.json` (lockfileVersion 3) and scans packages that are not
 * marked dev-only. Avoids spawning `license-checker`, which can break on newer
 * Node/npm stacks due to transitive read-package-json + glob compatibility issues.
 */

const fs = require("node:fs");
const path = require("node:path");

const lockPath = path.join(__dirname, "..", "package-lock.json");

const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));

if (!lock.packages || typeof lock.packages !== "object") {
  console.error("package-lock.json missing `packages` map (expected lockfileVersion 3).");
  process.exit(1);
}

/** Patterns match LGPL / AGPL / GPL family licenses (including compound SPDX strings). */
const forbiddenPatterns = [
  /\bLGPL\b/i,
  /\bAGPL\b/i,
  /\bGPL\b/i,
  /GNU LESSER GENERAL PUBLIC LICENSE/i,
  /GNU AFFERO GENERAL PUBLIC LICENSE/i,
  /GNU GENERAL PUBLIC LICENSE/i,
];

function normalizeLicense(raw) {
  if (raw === undefined || raw === null) {
    return "";
  }

  if (typeof raw === "string") {
    return raw;
  }

  if (typeof raw === "object" && typeof raw.type === "string") {
    return raw.type;
  }

  return "";
}

let violations = 0;

for (const [pkgPath, pkg] of Object.entries(lock.packages)) {
  if (!pkgPath || pkgPath === "") {
    continue;
  }

  if (pkg.dev === true) {
    continue;
  }

  const licStr = normalizeLicense(pkg.license);

  if (!licStr) {
    continue;
  }

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(licStr)) {
      console.error(
        `Forbidden copyleft license in production lockfile entry "${pkgPath}": ${licStr}`,
      );
      violations += 1;
      break;
    }
  }
}

if (violations > 0) {
  process.exit(1);
}

console.log("Production license check passed (package-lock: no GPL / AGPL / LGPL detected).");
