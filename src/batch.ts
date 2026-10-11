import { VendorError } from "agentic-core";
import { verifyAddress, type VerifyRequest } from "./address.js";
import type { AddressInput } from "./adapters/types.js";

const INPUT_COLUMNS = ["street", "line2", "city", "state", "postal", "country"];
const OUTPUT_COLUMNS = [
  "street",
  "line2",
  "city",
  "state",
  "postal",
  "country",
  "verified_street",
  "verified_city",
  "verified_state",
  "verified_postal",
  "verified_country",
  "deliverability",
  "score",
  "vendor",
  "error",
];

function splitLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

function escapeCell(cell: string): string {
  if (/[",\n]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
  return cell;
}

export function parseCsv(text: string): AddressInput[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) throw new VendorError("CSV is empty");
  const header = splitLine(lines[0]).map((cell) => cell.trim().toLowerCase());
  const indexes = INPUT_COLUMNS.map((name) => header.indexOf(name));
  if (indexes[0] < 0) throw new VendorError("CSV needs a street column");
  return lines.slice(1).map((line) => {
    const cells = splitLine(line);
    const row: AddressInput = { street: cells[indexes[0]]?.trim() ?? "" };
    if (indexes[1] >= 0) row.line2 = cells[indexes[1]]?.trim() ?? "";
    if (indexes[2] >= 0) row.city = cells[indexes[2]]?.trim() ?? "";
    if (indexes[3] >= 0) row.state = cells[indexes[3]]?.trim() ?? "";
    if (indexes[4] >= 0) row.postal = cells[indexes[4]]?.trim() ?? "";
    if (indexes[5] >= 0) row.country = cells[indexes[5]]?.trim() ?? "";
    return row;
  });
}

export interface BatchOptions {
  vendor?: VerifyRequest["vendor"];
  live?: boolean;
  apiKey?: string;
  authId?: string;
  fetchFn?: typeof fetch;
  now?: () => Date;
}

export async function verifyCsv(
  text: string,
  options: BatchOptions = {},
): Promise<string> {
  const rows = parseCsv(text);
  const out: string[] = [OUTPUT_COLUMNS.join(",")];
  for (const row of rows) {
    try {
      const receipt = await verifyAddress({ ...row, ...options });
      out.push(
        [
          row.street,
          row.line2 ?? "",
          row.city ?? "",
          row.state ?? "",
          row.postal ?? "",
          row.country ?? "",
          receipt.normalized.street,
          receipt.normalized.city,
          receipt.normalized.state,
          receipt.normalized.postal,
          receipt.normalized.country,
          receipt.deliverability,
          String(receipt.score),
          receipt.vendor,
          "",
        ]
          .map(escapeCell)
          .join(","),
      );
    } catch (error) {
      out.push(
        [
          row.street,
          row.line2 ?? "",
          row.city ?? "",
          row.state ?? "",
          row.postal ?? "",
          row.country ?? "",
          "",
          "",
          "",
          "",
          "",
          "unknown",
          "0",
          options.vendor ?? "dry",
          error instanceof Error ? error.message : String(error),
        ]
          .map(escapeCell)
          .join(","),
      );
    }
  }
  return `${out.join("\n")}\n`;
}
