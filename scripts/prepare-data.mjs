import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { classifyCall } from "./classifier.mjs";

const root = process.cwd();
const sourcePath = path.join(root, "calls_week_anon.xlsx");
const publicDir = path.join(root, "public");
const outputPath = path.join(publicDir, "calls.json");

if (!existsSync(sourcePath)) {
  console.warn("calls_week_anon.xlsx not found, skipping static data generation");
  process.exit(0);
}

const workbook = XLSX.readFile(sourcePath, { cellDates: false });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
const calls = rows.map((row, index) => ({
  id: `xlsx-${index + 1}`,
  ...row,
  ...classifyCall(row),
}));

mkdirSync(publicDir, { recursive: true });
writeFileSync(outputPath, JSON.stringify(calls));
console.log(`Generated ${path.relative(root, outputPath)} with ${calls.length} calls`);
