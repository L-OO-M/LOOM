// One read model for the department-report export.
//
// JSON, CSV and PDF are renderers over the SAME payload. That is deliberate:
// the acceptance criterion for #51 is that two formats cannot disagree, so no
// format is allowed to run its own query. The coverage grid in the admin UI is
// built from this same payload shape, which also means "missing month" cannot
// mean one thing on screen and another in the download.
import { scope } from "@/lib/tenant-scope";

const PERIOD_MONTHS = { semester: 6, annual: 12 };

export const REPORT_NARRATIVE_LIMIT = 4000;

function monthKey(value) {
  return String(value || "").slice(0, 7);
}

export function reportMonths(scopeParam, now = new Date()) {
  const count = PERIOD_MONTHS[scopeParam] ?? PERIOD_MONTHS.semester;
  const months = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(d.toISOString().slice(0, 7));
  }
  return months;
}

export function reportSince(months) {
  return `${months[0]}-01`;
}

export function buildCoverage({ departments, reports, months }) {
  const filed = new Set(reports.map((r) => `${r.department_id}|${monthKey(r.month)}`));
  return departments.map((d) => ({
    department_id: d.id,
    department_name: d.name,
    vertical: d.vertical ?? null,
    months: months.map((month) => ({
      month,
      status: filed.has(`${d.id}|${month}`) ? "submitted" : "missing"
    }))
  }));
}

export async function loadReportExport({ sql, tenantId, scopeParam = "semester", viewer = {} }) {
  const normalizedScope = scopeParam === "annual" ? "annual" : "semester";
  const months = reportMonths(normalizedScope);
  const since = reportSince(months);
  const verticalFilter = viewer.role === "vertical_lead" && viewer.vertical
    ? sql`d.vertical = ${viewer.vertical}`
    : sql`TRUE`;

  const reports = await sql`
    SELECT r.*, d.name AS department_name, d.vertical, p.name AS submitted_by_name
    FROM dept_reports r
    JOIN departments d ON d.id = r.department_id
    LEFT JOIN profiles p ON p.user_id = r.submitted_by
    WHERE r.status = 'submitted'
      AND r.tenant_id = ${scope(tenantId)}::uuid
      AND r.month >= ${since}::date
      AND (${verticalFilter})
    ORDER BY r.month DESC, d.name ASC
  `;
  const departments = await sql`
    SELECT d.id, d.name, d.vertical
    FROM departments d
    WHERE d.is_active
      AND d.tenant_id = ${scope(tenantId)}::uuid
      AND (${verticalFilter})
    ORDER BY d.name ASC
  `;
  const contributions = await sql`
    SELECT c.department_id, c.kind, COUNT(*)::int AS n FROM member_contributions c
    JOIN departments d ON d.id = c.department_id
    WHERE c.tenant_id = ${scope(tenantId)}::uuid
      AND c.created_at >= ${since}::timestamptz
      AND (${verticalFilter})
    GROUP BY c.department_id, c.kind
    ORDER BY c.department_id, c.kind
  `;
  const memberships = await sql`
    SELECT m.department_id, COUNT(*)::int AS n FROM department_memberships m
    JOIN departments d ON d.id = m.department_id
    WHERE d.tenant_id = ${scope(tenantId)}::uuid
      AND (${verticalFilter})
    GROUP BY m.department_id
    ORDER BY m.department_id
  `;

  const coverage = buildCoverage({ departments, reports, months });
  return {
    scope: normalizedScope,
    months,
    since,
    exported_at: new Date().toISOString(),
    tenant_id: tenantId,
    submitted_reports: reports,
    departments,
    contribution_counts: contributions,
    membership_counts: memberships,
    coverage,
    totals: {
      submitted_reports: reports.length,
      departments: departments.length,
      missing_months: coverage.reduce(
        (sum, row) => sum + row.months.filter((m) => m.status === "missing").length,
        0
      ),
      contributions: contributions.reduce((sum, row) => sum + (row.n ?? 0), 0)
    }
  };
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function reportFigures(report) {
  const draft = report.draft || {};
  return {
    contributions_total: draft.contributions_total ?? 0,
    events_held: draft.events_held ?? 0,
    new_members: draft.new_members ?? 0,
    workshops_upcoming: draft.workshops_upcoming ?? 0
  };
}

function monthLabel(month) {
  const [y, m] = String(month).split("-").map(Number);
  if (!y || !m) return String(month || "");
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

export function reportCsv(payload) {
  const lines = [];
  const row = (...cells) => lines.push(cells.map(csvCell).join(","));
  const blank = () => lines.push("");

  row("Department report export", payload.scope);
  row("Generated", payload.exported_at);
  row("Period", `${payload.months[0]} to ${payload.months[payload.months.length - 1]}`);
  row("Submitted reports", payload.totals.submitted_reports);
  row("Departments covered", payload.totals.departments);
  row("Missing department-months", payload.totals.missing_months);
  blank();

  row("Submitted reports");
  row(
    "department", "vertical", "month", "status", "submitted_by",
    "submitted_at", "contributions_total", "events_held", "new_members",
    "workshops_upcoming", "narrative"
  );
  for (const report of payload.submitted_reports) {
    const figures = reportFigures(report);
    row(
      report.department_name,
      report.vertical,
      monthKey(report.month),
      report.status,
      report.submitted_by_name,
      report.submitted_at,
      figures.contributions_total,
      figures.events_held,
      figures.new_members,
      figures.workshops_upcoming,
      report.narrative ?? ""
    );
  }
  blank();

  row("Coverage");
  row("department", "month", "status");
  for (const covered of payload.coverage) {
    for (const month of covered.months) {
      row(covered.department_name, month.month, month.status);
    }
  }
  blank();

  row("Contribution counts");
  row("department_id", "kind", "count");
  for (const contribution of payload.contribution_counts) {
    row(contribution.department_id, contribution.kind, contribution.n);
  }
  blank();

  row("Membership counts");
  row("department_id", "count");
  for (const membership of payload.membership_counts) {
    row(membership.department_id, membership.n);
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function ascii(value) {
  return String(value ?? "").replace(/[^\x20-\x7E]/g, "?");
}

function pdfEscape(value) {
  return ascii(value).replace(/([\\()])/g, "\\$1");
}

function wrap(text, width = 96) {
  const words = ascii(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const out = [];
  let line = "";
  for (const word of words) {
    if (!line) line = word;
    else if (`${line} ${word}`.length <= width) line += ` ${word}`;
    else {
      out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  return out;
}

function buildPdf(lines) {
  const perPage = 46;
  const pages = [];
  for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));
  if (pages.length === 0) pages.push([""]);

  const objects = [];
  const pageIds = pages.map((_, i) => 4 + i * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  pages.forEach((pageLines, index) => {
    const pageId = 4 + index * 2;
    const contentId = pageId + 1;
    const content = [
      "BT",
      "/F1 10 Tf",
      "14 TL",
      "40 800 Td",
      ...pageLines.map((line) => `(${pdfEscape(line)}) Tj T*`),
      "ET"
    ].join("\n");
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`;
  });

  let body = "%PDF-1.4\n";
  const offsets = [];
  const size = objects.length;
  for (let i = 1; i < size; i += 1) {
    offsets[i] = Buffer.byteLength(body, "latin1");
    body += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let i = 1; i < size; i += 1) {
    body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

export function reportPdf(payload) {
  const lines = [];
  lines.push("LOOM department report export");
  lines.push(`Period: ${payload.months[0]} to ${payload.months[payload.months.length - 1]} (${payload.scope})`);
  lines.push(`Generated: ${payload.exported_at}`);
  lines.push("");
  lines.push("Summary");
  lines.push(`  Submitted reports: ${payload.totals.submitted_reports}`);
  lines.push(`  Departments covered: ${payload.totals.departments}`);
  lines.push(`  Missing department-months: ${payload.totals.missing_months}`);
  lines.push(`  Contributions logged: ${payload.totals.contributions}`);
  lines.push("");
  lines.push("Submitted reports");
  if (payload.submitted_reports.length === 0) {
    lines.push("  No submitted reports in this period.");
  }
  for (const report of payload.submitted_reports) {
    const figures = reportFigures(report);
    lines.push(`  ${report.department_name} - ${monthLabel(report.month)}`);
    lines.push(`    Contributions ${figures.contributions_total} / events ${figures.events_held} / new members ${figures.new_members} / upcoming ${figures.workshops_upcoming}`);
    if (report.submitted_by_name) lines.push(`    Submitted by ${report.submitted_by_name}`);
    if (report.narrative) {
      lines.push("    Narrative:");
      for (const line of wrap(report.narrative)) lines.push(`      ${line}`);
    }
  }
  lines.push("");
  lines.push("Coverage (department x month)");
  for (const row of payload.coverage) {
    lines.push(`  ${row.department_name}`);
    for (const month of row.months) lines.push(`    ${month.month}: ${month.status}`);
  }
  lines.push("");
  lines.push("Contribution counts");
  for (const row of payload.contribution_counts) {
    lines.push(`  ${row.department_id} / ${row.kind}: ${row.n}`);
  }
  lines.push("");
  lines.push("Membership counts");
  for (const row of payload.membership_counts) {
    lines.push(`  ${row.department_id}: ${row.n}`);
  }
  return buildPdf(lines);
}
