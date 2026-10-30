// Small RFC 4180 CSV reader: quoted fields, "" escapes, CRLF/LF, a leading BOM,
// and comma / semicolon / tab delimiters (detected from the first line).
export function detectDelimiter(text) {
  const first = text.slice(0, text.search(/\r?\n|$/));
  let best = ',', bestCount = 0;
  for (const d of [',', ';', '\t']) {
    const c = first.split(d).length - 1;
    if (c > bestCount) { best = d; bestCount = c; }
  }
  return best;
}

// Calls onRow(fields, lineNumber) for each record; lineNumber is 1-based.
export function forEachCsvRow(text, onRow, delimiter = detectDelimiter(text)) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const n = text.length;
  let i = 0, line = 1;
  while (i < n) {
    const fields = [];
    const startLine = line;
    for (;;) {
      let value = '';
      if (text[i] === '"') {
        i++;
        for (;;) {
          if (i >= n) throw new Error('Unterminated quoted field starting on line ' + startLine);
          const ch = text[i];
          if (ch === '"') {
            if (text[i + 1] === '"') { value += '"'; i += 2; continue; }
            i++;
            break;
          }
          if (ch === '\n') line++;
          value += ch;
          i++;
        }
        while (i < n && text[i] !== delimiter && text[i] !== '\n' && text[i] !== '\r') i++;
      } else {
        const start = i;
        while (i < n && text[i] !== delimiter && text[i] !== '\n' && text[i] !== '\r') i++;
        value = text.slice(start, i);
      }
      fields.push(value);
      if (i < n && text[i] === delimiter) { i++; continue; }
      break;
    }
    if (text[i] === '\r') i++;
    if (text[i] === '\n') { i++; line++; }
    if (!(fields.length === 1 && fields[0].trim() === '')) onRow(fields, startLine);
  }
}

export function parseCsv(text, delimiter) {
  const rows = [];
  forEachCsvRow(text, (r) => rows.push(r), delimiter);
  return rows;
}

// Finds the first header column whose normalized name is in `names`.
export function findColumn(header, names) {
  const norm = (s) => String(s).trim().toLowerCase().replace(/[\s_-]+/g, '');
  const wanted = names.map(norm);
  return header.findIndex((h) => wanted.includes(norm(h)));
}
