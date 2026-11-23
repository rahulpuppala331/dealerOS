/**
 * Pure, side-effect-free cleaning and exact decimal parsing helpers.
 *
 * All money values are represented internally as integer minor units (cents)
 * to avoid IEEE-754 floating-point drift (where 0.1 + 0.2 !== 0.3).
 */

/**
 * Normalizes messy System B record references to canonical "REC-<digits>".
 *
 * Examples:
 * - "REC-1034"     -> "REC-1034"
 * - "rec1034"      -> "REC-1034"
 * - " REC - 1070 " -> "REC-1070"
 * - "1112"         -> "REC-1112"
 * - "" / "abc"     -> null
 */
export function normalizeRef(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/\d+/);
  return match ? `REC-${match[0]}` : null;
}

/**
 * Parses a raw monetary string into exact integer cents (minor units).
 *
 * - Strips outer whitespace and grouping commas (both international and
 *   Indian grouping such as "1,25,400.00").
 * - Blank or unparseable values strictly return `null` — NEVER `0`.
 */
export function parseAmountToCents(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const cleaned = raw.trim().replace(/,/g, '');
  if (!cleaned) return null;

  const match = cleaned.match(/^(-)?(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;

  const [, sign, wholePart, fracPart = ''] = match;
  const whole = Number(wholePart);
  const frac = Number(fracPart.padEnd(2, '0'));
  if (!Number.isSafeInteger(whole)) return null;

  const cents = whole * 100 + frac;
  if (!Number.isSafeInteger(cents)) return null;

  return sign ? (cents === 0 ? 0 : -cents) : cents;
}

/**
 * Formats exact integer cents into a fixed 2-decimal string ("125400.00").
 * Returns `null` for `null` input so missing values are never coerced to "0.00".
 */
export function formatCents(cents: number | null): string | null {
  if (cents === null) return null;
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

/**
 * Minimal RFC-4180 CSV parser keeping every cell as raw string without
 * auto-converting numbers or dates, handling quoted comma fields cleanly.
 */
export function parseCsv(content: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  const text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        currentCell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentCell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentCell);
      currentCell = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') {
        i++;
      }
      if (currentRow.length > 0 || currentCell !== '') {
        currentRow.push(currentCell);
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      }
    } else {
      currentCell += ch;
    }
  }

  if (currentRow.length > 0 || currentCell !== '') {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      record[headers[i]] = (row[i] ?? '').trim();
    }
    return record;
  });
}
