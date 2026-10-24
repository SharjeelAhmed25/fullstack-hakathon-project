export function parseCsv(text) {
  if (typeof text !== "string" || !text.trim()) throw new Error("Upload a non-empty CSV file.");
  const rows = [];
  let row = [], field = "", quoted = false, quoteClosed = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
        quoteClosed = true;
      } else {
        field += char;
      }
    } else if (quoteClosed) {
      if (char === ",") {
        row.push(field);
        field = "";
        quoteClosed = false;
      } else if (char === "\n" || char === "\r") {
        row.push(field);
        field = "";
        quoteClosed = false;
        if (char === "\r" && text[index + 1] === "\n") index++;
        if (row.some((cell) => cell.trim())) rows.push(row);
        row = [];
      } else {
        throw new Error("CSV contains unexpected characters after a quoted field.");
      }
    } else if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === '"') {
      throw new Error("CSV contains a quote inside an unquoted field.");
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  if (rows.length < 2) throw new Error("CSV must contain a header and at least one employee row.");

  const headers = rows[0].map((header) => header.replace(/^\uFEFF/, "").trim());
  if (new Set(headers).size !== headers.length) throw new Error("CSV contains duplicate column names.");
  if (rows.slice(1).some((cells) => cells.length !== headers.length)) throw new Error("CSV rows must contain the same number of columns as the header.");
  return rows.slice(1).map((cells, index) => ({
    rowNumber: index + 2,
    values: Object.fromEntries(headers.map((header, column) => [header, (cells[column] || "").trim()]))
  }));
}

export function escapeCsv(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
