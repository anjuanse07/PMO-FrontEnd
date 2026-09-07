/**
 * Shared helpers for CSV/PDF export and CSV import, used by every page that
 * builds a downloadable report (Audit Logs, History Log, Yearly Schedule
 * Matrix). Extracted because the same small pieces of logic - escaping a
 * CSV field, escaping an HTML value, opening a print window - had been
 * independently reimplemented (with slightly different names and, in one
 * case, different quoting rules) in three separate page files.
 */

/**
 * Escapes a single CSV field by always wrapping it in double quotes and
 * doubling any internal quotes. This is the "always quote" style already
 * used by every CSV export on the backend (server.js) - standardizing the
 * frontend on the same convention rather than the alternative
 * "only quote if it contains a comma/quote/newline" style, since both are
 * valid CSV but consistency with the backend matters more than shaving a
 * few characters off simple values.
 */
export function escapeCsvValue(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

/** Escapes a value for safe interpolation into a print-window's HTML. */
export function escapeHtmlValue(value: unknown): string {
  return String(value ?? "-").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  }[character] || character));
}

/**
 * Parses one line of a CSV file into its fields, handling quoted fields
 * (including embedded commas and escaped "" quotes within them). Used when
 * reading a user-uploaded CSV for import (e.g. History Log's bulk import).
 */
export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map((value) => value.trim());
}

/**
 * Writes a full HTML document into an already-opened window and triggers
 * the browser's print dialog - the mechanical last step shared by every
 * "Export PDF" button in this app (they differ before this point in how
 * they gather their data, so only this shared tail is extracted).
 *
 * Caller is still responsible for `window.open("", "_blank")`, checking for
 * a popup blocker, and closing the window on error - those differ enough
 * between callers (one fetches fresh data asynchronously after opening the
 * window, another uses already-loaded local data) that forcing them into
 * one rigid function would cost more clarity than it saves.
 */
export function writeAndPrintHtml(reportWindow: Window, html: string): void {
  reportWindow.document.write(html);
  reportWindow.document.close();
  reportWindow.focus();
  reportWindow.print();
}
