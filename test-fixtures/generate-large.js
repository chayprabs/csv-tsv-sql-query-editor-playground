/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");

const outputPath = path.join(__dirname, "large.csv");
const categories = ["alpha", "beta", "gamma", "delta", "epsilon"];
const rows = ["id,category,value,active,created_date"];

for (let index = 1; index <= 50000; index += 1) {
  const category = categories[(index - 1) % categories.length];
  const value = ((index * 17) % 10000) / 7;
  const active = index % 2;
  const month = String(((index - 1) % 12) + 1).padStart(2, "0");
  const day = String(((index - 1) % 28) + 1).padStart(2, "0");

  rows.push(
    `${index},${category},${value.toFixed(2)},${active},2026-${month}-${day}`,
  );
}

fs.writeFileSync(outputPath, `${rows.join("\n")}\n`, "utf8");
console.log(`Wrote ${outputPath}`);
