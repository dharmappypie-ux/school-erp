/**
 * A minimal .xlsx reader: enough to turn the first worksheet into a grid of
 * strings, and nothing more.
 *
 * Why hand-rolled rather than a library. The npm build of SheetJS is frozen at
 * 0.18.5 and carries published prototype-pollution and ReDoS advisories;
 * ExcelJS pulls in Node stream and zlib shims that do not belong in a
 * Cloudflare Worker bundle. Reading one sheet is a ZIP directory walk, an
 * inflate the platform already provides, and a small XML scan — so that is
 * what this does. It deliberately does NOT write .xlsx, handle charts,
 * formulas, multiple sheets or encryption.
 *
 * An .xlsx is a ZIP of XML parts:
 *   xl/workbook.xml          — which sheets exist, in order
 *   xl/_rels/workbook.xml.rels — maps a sheet's rId to its file
 *   xl/worksheets/sheet1.xml — the cells
 *   xl/sharedStrings.xml     — the string table most text cells point into
 *   xl/styles.xml            — needed only to know which numbers are dates
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;

interface ZipEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
}

/**
 * Reads the ZIP central directory.
 *
 * The directory is at the END of the file, located by scanning backwards for
 * its signature — a ZIP cannot be parsed front-to-back because an entry's
 * local header may lie about its sizes (bit 3 of the flags defers them to a
 * trailing descriptor); the central directory is the authority.
 */
function readZipEntries(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // The EOCD is 22 bytes plus a comment of up to 65535.
  let eocd = -1;
  const earliest = Math.max(0, bytes.length - 22 - 0xffff);
  for (let offset = bytes.length - 22; offset >= earliest; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a valid .xlsx file (no ZIP directory).");

  const entryCount = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);

  const entries = new Map<string, ZipEntry>();
  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) break;

    const compressionMethod = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);

    const name = new TextDecoder().decode(
      bytes.subarray(cursor + 46, cursor + 46 + nameLength),
    );
    entries.set(name, { name, compressionMethod, compressedSize, localHeaderOffset });

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

/** Inflates one entry to text. Uses the platform's DecompressionStream. */
async function readEntry(
  bytes: Uint8Array,
  entry: ZipEntry,
): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const local = entry.localHeaderOffset;

  // The local header repeats the name and extra fields with their own lengths,
  // which are what actually locate the data — the central copy may differ.
  const nameLength = view.getUint16(local + 26, true);
  const extraLength = view.getUint16(local + 28, true);
  const start = local + 30 + nameLength + extraLength;
  const data = bytes.subarray(start, start + entry.compressedSize);

  if (entry.compressionMethod === 0) {
    return new TextDecoder().decode(data);
  }
  if (entry.compressionMethod !== 8) {
    throw new Error(`Unsupported compression in ${entry.name}.`);
  }

  // "deflate-raw": the ZIP payload has no zlib header.
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeXml(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    }
    if (body.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    }
    return ENTITIES[body] ?? whole;
  });
}

/**
 * The shared string table.
 *
 * One <si> may hold several <t> runs when part of the cell was formatted
 * differently; they concatenate into one value.
 */
function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  const itemPattern = /<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g;
  const textPattern = /<t\b[^>]*>([\s\S]*?)<\/t>/g;

  let item: RegExpExecArray | null;
  while ((item = itemPattern.exec(xml)) !== null) {
    const body = item[1] ?? "";
    let combined = "";
    let run: RegExpExecArray | null;
    textPattern.lastIndex = 0;
    while ((run = textPattern.exec(body)) !== null) {
      combined += decodeXml(run[1]);
    }
    strings.push(combined);
  }
  return strings;
}

/** Built-in number formats that mean "this is a date". */
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

/**
 * Works out which style indices render as a date.
 *
 * Without this, a date cell arrives as 42240 — Excel stores dates as a number
 * and only the format makes it a date. Importing 42240 as a birthday is the
 * kind of error nobody notices until a report card prints.
 */
function parseDateStyles(xml: string): Set<number> {
  const dateFormatIds = new Set<number>(BUILTIN_DATE_FORMATS);

  const customPattern = /<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g;
  let custom: RegExpExecArray | null;
  while ((custom = customPattern.exec(xml)) !== null) {
    const code = decodeXml(custom[2]);
    // Strip quoted literals and colour/condition blocks before looking for
    // date tokens, so a currency format like "y"#,##0 is not mistaken for one.
    const bare = code.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "");
    if (/[ymd]/i.test(bare) && !/^[^ymd]*$/i.test(bare)) {
      dateFormatIds.add(Number(custom[1]));
    }
  }

  const styles = new Set<number>();
  const cellXfsBlock = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
  if (!cellXfsBlock) return styles;

  const xfPattern = /<xf\b[^>]*>|<xf\b[^>]*\/>/g;
  let xf: RegExpExecArray | null;
  let index = 0;
  while ((xf = xfPattern.exec(cellXfsBlock[1])) !== null) {
    const id = /numFmtId="(\d+)"/.exec(xf[0]);
    if (id && dateFormatIds.has(Number(id[1]))) styles.add(index);
    index += 1;
  }
  return styles;
}

/** "BC12" → 54 (zero-based column index). */
function columnIndex(reference: string): number {
  const letters = /^([A-Z]+)/.exec(reference.toUpperCase());
  if (!letters) return 0;
  let value = 0;
  for (const char of letters[1]) {
    value = value * 26 + (char.charCodeAt(0) - 64);
  }
  return value - 1;
}

/**
 * Excel's day number → a date.
 *
 * The epoch is 1899-12-30, not 1900-01-01, because Excel deliberately kept
 * Lotus 1-2-3's belief that 1900 was a leap year. Serials below 61 predate the
 * phantom 29 February and are effectively unused by real files.
 */
function serialToDateString(serial: number): string {
  const days = Math.floor(serial);
  const date = new Date(Date.UTC(1899, 11, 30) + days * 86400000);
  return date.toISOString().slice(0, 10);
}

/**
 * Reads the first worksheet of an .xlsx into a grid of trimmed strings,
 * shaped exactly like `parseCsv` output so the two paths share all validation.
 */
export async function readXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const bytes = new Uint8Array(buffer);
  const entries = readZipEntries(bytes);

  // Which sheet is first in the workbook's own order — not whichever file
  // happens to be called sheet1.xml, which is not always the same thing.
  let sheetPath = "xl/worksheets/sheet1.xml";
  const workbookEntry = entries.get("xl/workbook.xml");
  const relsEntry = entries.get("xl/_rels/workbook.xml.rels");
  if (workbookEntry && relsEntry) {
    const workbook = await readEntry(bytes, workbookEntry);
    const firstSheet = /<sheet\b[^>]*\/?>/.exec(workbook)?.[0] ?? "";
    const relId = /r:id="([^"]+)"/.exec(firstSheet)?.[1];
    if (relId) {
      const rels = await readEntry(bytes, relsEntry);
      const pattern = new RegExp(`<Relationship\\b[^>]*Id="${relId}"[^>]*>`);
      const target = /Target="([^"]+)"/.exec(pattern.exec(rels)?.[0] ?? "")?.[1];
      if (target) {
        const cleaned = target.replace(/^\/?(xl\/)?/, "");
        if (entries.has(`xl/${cleaned}`)) sheetPath = `xl/${cleaned}`;
      }
    }
  }

  const sheetEntry = entries.get(sheetPath);
  if (!sheetEntry) throw new Error("That workbook has no readable worksheet.");

  const sharedEntry = entries.get("xl/sharedStrings.xml");
  const stylesEntry = entries.get("xl/styles.xml");

  const [sheetXml, sharedXml, stylesXml] = await Promise.all([
    readEntry(bytes, sheetEntry),
    sharedEntry ? readEntry(bytes, sharedEntry) : Promise.resolve(""),
    stylesEntry ? readEntry(bytes, stylesEntry) : Promise.resolve(""),
  ]);

  const shared = sharedXml ? parseSharedStrings(sharedXml) : [];
  const dateStyles = stylesXml ? parseDateStyles(stylesXml) : new Set<number>();

  const grid: string[][] = [];
  const rowPattern = /<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g;
  const cellPattern = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;

  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowPattern.exec(sheetXml)) !== null) {
    const body = rowMatch[1] ?? "";
    const cells: string[] = [];

    let cellMatch: RegExpExecArray | null;
    cellPattern.lastIndex = 0;
    while ((cellMatch = cellPattern.exec(body)) !== null) {
      const attributes = cellMatch[1] ?? "";
      const content = cellMatch[2] ?? "";

      const reference = /r="([A-Z]+\d+)"/i.exec(attributes)?.[1];
      const type = /t="([^"]+)"/.exec(attributes)?.[1] ?? "n";
      const styleIndex = Number(/s="(\d+)"/.exec(attributes)?.[1] ?? "-1");

      // Skipped columns are empty cells, not a shift left.
      const target = reference ? columnIndex(reference) : cells.length;
      while (cells.length < target) cells.push("");

      let value = "";
      if (type === "s") {
        const index = Number(/<v>([\s\S]*?)<\/v>/.exec(content)?.[1] ?? "-1");
        value = shared[index] ?? "";
      } else if (type === "inlineStr") {
        const runs = content.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) ?? [];
        value = runs
          .map((run) => decodeXml(run.replace(/<[^>]+>/g, "")))
          .join("");
      } else {
        const raw = /<v>([\s\S]*?)<\/v>/.exec(content)?.[1] ?? "";
        value = decodeXml(raw);
        if (
          value !== "" &&
          type === "n" &&
          styleIndex >= 0 &&
          dateStyles.has(styleIndex)
        ) {
          const serial = Number(value);
          if (Number.isFinite(serial) && serial > 0) {
            value = serialToDateString(serial);
          }
        }
      }

      cells.push(value.trim());
    }

    grid.push(cells);
  }

  return grid.filter((row) => row.some((cell) => cell !== ""));
}
