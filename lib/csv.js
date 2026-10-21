const DANGEROUS_PREFIX = /^[=+\-@\t\r]/;

export function csvCell(value) {
  if (value == null) return "";
  let text = String(value);
  if (DANGEROUS_PREFIX.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

export function csvResponse(filename, body) {
  const safe = String(filename || "export.csv").replace(/[^a-zA-Z0-9._-]/g, "-");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safe.endsWith(".csv") ? safe : `${safe}.csv`}"`,
      "X-Content-Type-Options": "nosniff"
    }
  });
}
