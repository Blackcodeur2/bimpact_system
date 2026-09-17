export interface CsvColumn<T> {
  label: string;
  value: (row: T) => string | number | null | undefined;
}

/**
 * CSV pour tableur français (séparateur « ; », BOM UTF-8).
 * Les cellules commençant par = + - @ sont neutralisées (injection de formules).
 */
export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const escape = (raw: string | number | null | undefined) => {
    let text = raw === null || raw === undefined ? '' : String(raw);
    if (/^[=+\-@\t\r]/.test(text) && typeof raw !== 'number') text = `'${text}`;
    return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [columns.map((column) => escape(column.label)).join(';'), ...rows.map((row) => columns.map((column) => escape(column.value(row))).join(';'))];
  return `﻿${lines.join('\r\n')}`;
}

export function downloadCsv(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
