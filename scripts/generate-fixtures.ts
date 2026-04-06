import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const GENERATED_FIXTURES_DIR = path.resolve(
  process.cwd(),
  "tests",
  "fixtures",
  "generated",
);

function csv(rows: string[][], delimiter = ","): string {
  return `${rows
    .map((row) =>
      row
        .map((value) => {
          const raw = String(value);

          if (
            raw.includes('"') ||
            raw.includes("\n") ||
            raw.includes("\r") ||
            raw.includes(delimiter)
          ) {
            return `"${raw.replace(/"/g, '""')}"`;
          }

          return raw;
        })
        .join(delimiter),
    )
    .join("\n")}\n`;
}

function buildManyColumnsCsv(columnCount: number, rowCount: number): string {
  const header = Array.from({ length: columnCount }, (_, index) => `col_${index + 1}`);
  const rows = [header];

  for (let rowIndex = 1; rowIndex <= rowCount; rowIndex += 1) {
    rows.push(
      Array.from(
        { length: columnCount },
        (_, columnIndex) => `r${rowIndex}_c${columnIndex + 1}`,
      ),
    );
  }

  return csv(rows);
}

function buildLongQuerySeedCsv(rowCount: number): string {
  const rows = [["id", "segment", "amount"]];

  for (let index = 1; index <= rowCount; index += 1) {
    rows.push([
      String(index),
      `segment_${((index - 1) % 12) + 1}`,
      String((index * 17) % 1000),
    ]);
  }

  return csv(rows);
}

function latin1Bytes(text: string): Buffer {
  return Buffer.from(text, "latin1");
}

function utf16LeBytes(text: string, withBom = false): Buffer {
  const content = Buffer.from(text, "utf16le");

  if (!withBom) {
    return content;
  }

  return Buffer.concat([Buffer.from([0xff, 0xfe]), content]);
}

async function writeTextFixture(
  directory: string,
  filename: string,
  contents: string,
): Promise<void> {
  await writeFile(path.join(directory, filename), contents, "utf8");
}

async function writeBinaryFixture(
  directory: string,
  filename: string,
  contents: Buffer,
): Promise<void> {
  await writeFile(path.join(directory, filename), contents);
}

export async function generateFixtures(
  outputDirectory = GENERATED_FIXTURES_DIR,
): Promise<void> {
  await rm(outputDirectory, { force: true, recursive: true });
  await mkdir(outputDirectory, { recursive: true });

  await writeTextFixture(
    outputDirectory,
    "analyst_employees.csv",
    csv([
      ["employee_id", "name", "department_id", "salary", "city"],
      ["1", "Alice", "10", "95000.25", "Austin"],
      ["2", "Bob", "20", "72000.00", "Boston"],
      ["3", "Carla", "10", "101500.00", "Chicago"],
      ["4", "Deepak", "30", "68000.75", "Dallas"],
    ]),
  );

  await writeTextFixture(
    outputDirectory,
    "analyst_departments.csv",
    csv([
      ["department_id", "department_name", "region"],
      ["10", "Engineering", "North"],
      ["20", "Finance", "East"],
      ["30", "Support", "South"],
    ]),
  );

  await writeTextFixture(
    outputDirectory,
    "excel_semicolon.csv",
    csv(
      [
        ["month", "country", "revenue"],
        ["Jan", "Germany", "12345,67"],
        ["Feb", "France", "11321,12"],
        ["Mar", "Spain", "9321,55"],
      ],
      ";",
    ),
  );

  await writeTextFixture(
    outputDirectory,
    "database_reserved_words.csv",
    csv([
      ["select", "from", "order", "group"],
      ["1", "north", "10", "alpha"],
      ["2", "south", "20", "beta"],
    ]),
  );

  await writeTextFixture(
    outputDirectory,
    "government_population.csv",
    csv([
      ["district_name", "population_2025", "median_age", "vacancy_rate"],
      ["Ward 1", "125000", "34.6", "2.1"],
      ["Ward 2", "118500", "36.1", ""],
      ["Ward 3", "131200", "33.8", "1.7"],
    ]),
  );

  await writeTextFixture(
    outputDirectory,
    "scientific_readings.tsv",
    csv(
      [
        ["sample_id", "wavelength_nm", "signal", "notes"],
        ["S-001", "532.0", "0.9821", "stable"],
        ["S-002", "532.0", "0.4412", "drift detected"],
        ["S-003", "635.0", "1.1049", "calibration ok"],
      ],
      "\t",
    ),
  );

  await writeTextFixture(
    outputDirectory,
    "financial_accounts.csv",
    csv([
      ["account_id", "routing_code", "balance", "currency"],
      ["0001234567", "021000021", "1200.55", "USD"],
      ["0001234568", "021000021", "0.00", "USD"],
      ["0002234567", "110000000", "995.10", "EUR"],
    ]),
  );

  await writeTextFixture(
    outputDirectory,
    "legacy_no_header.txt",
    csv(
      [
        ["1001", "Ada", "north", "active"],
        ["1002", "Grace", "west", "active"],
        ["1003", "Linus", "south", "inactive"],
      ],
      "|",
    ),
  );

  await writeTextFixture(
    outputDirectory,
    "quoted_multiline.csv",
    csv([
      ["ticket_id", "summary", "comment"],
      ["1", "Escalation", "first line\nsecond line"],
      ["2", "Reminder", "contains,comma"],
      ["3", "Quote", 'contains "quotes"'],
    ]),
  );

  await writeTextFixture(
    outputDirectory,
    "ragged_rows.csv",
    "id,name,score\n1,Ada\n2,Grace,98,unexpected\n3,Linus,77\n",
  );

  await writeTextFixture(
    outputDirectory,
    "duplicate_headers.csv",
    "name,name,,region\nAda,Lovelace,1,north\nGrace,Hopper,2,east\n",
  );

  await writeTextFixture(
    outputDirectory,
    "broken_quotes.csv",
    'id,comment\n1,"unterminated\n2,"still broken"\n',
  );

  await writeTextFixture(
    outputDirectory,
    "unicode_cities.csv",
    csv([
      ["name", "city", "emoji"],
      ["Andre", "Sao Paulo", "BR"],
      ["Muller", "Munchen", "DE"],
      ["Soren", "Kobenhavn", "DK"],
      ["Li Hua", "Beijing", "CN"],
    ]),
  );

  await writeBinaryFixture(
    outputDirectory,
    "latin1_customers.csv",
    latin1Bytes("customer_id,name,city\n1,Pe\xf1a,M\xe1laga\n2,M\xfcller,M\xfcnchen\n"),
  );

  await writeBinaryFixture(
    outputDirectory,
    "utf16_inventory.tsv",
    utf16LeBytes("sku\twarehouse\tquantity\nA-100\tBLR\t12\nA-200\tAMS\t5\n", true),
  );

  await writeTextFixture(
    outputDirectory,
    "formula_cells.csv",
    csv([
      ["id", "formula_like_value", "notes"],
      ["1", "=SUM(A1:A2)", "starts with equals"],
      ["2", "+1+2", "starts with plus"],
      ["3", "-10+5", "starts with minus"],
      ["4", "@cmd", "starts with at-sign"],
    ]),
  );

  await writeTextFixture(outputDirectory, "empty.csv", "");
  await writeBinaryFixture(
    outputDirectory,
    "bom_only.csv",
    Buffer.from([0xef, 0xbb, 0xbf]),
  );
  await writeBinaryFixture(
    outputDirectory,
    "binary_masquerade.csv",
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );

  await writeTextFixture(
    outputDirectory,
    "many_columns_1000.csv",
    buildManyColumnsCsv(1000, 2),
  );
  await writeTextFixture(
    outputDirectory,
    "long_query_seed.csv",
    buildLongQuerySeedCsv(200),
  );

  await writeTextFixture(
    outputDirectory,
    "join_customers.csv",
    csv([
      ["customer_id", "customer_name", "segment"],
      ["1", "Northwind", "enterprise"],
      ["2", "Contoso", "midmarket"],
      ["3", "Globex", "smb"],
    ]),
  );

  await writeTextFixture(
    outputDirectory,
    "join_orders.csv",
    csv([
      ["order_id", "customer_id", "amount", "status"],
      ["100", "1", "2500.00", "paid"],
      ["101", "1", "400.00", "pending"],
      ["102", "2", "900.00", "paid"],
      ["103", "3", "125.50", "paid"],
    ]),
  );

  for (let index = 1; index <= 21; index += 1) {
    await writeTextFixture(
      outputDirectory,
      `boundary_file_${String(index).padStart(2, "0")}.csv`,
      csv([
        ["id", "value"],
        [String(index), `file_${index}`],
      ]),
    );
  }
}

async function main() {
  await generateFixtures();
  console.log(`Generated fixtures in ${GENERATED_FIXTURES_DIR}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
