// Optional GitHub Issues bridge for feature requests.
//
// Deliberate constraints:
//   - Off by default. No token or repo configured means every function is a
//     no-op, and submitting an idea behaves exactly as it did before.
//   - Never blocks the user's action. A GitHub outage must not lose a feature
//     request, so callers store first and sync afterwards; failures land in
//     `github_issue_error` where an admin can see them.
//   - Never logs or returns the token. Errors carry a status code and a short
//     human sentence, never the response body (which can echo request headers
//     in proxied setups).
//   - No label is attached on create. A label that does not exist yet makes
//     GitHub return 422, which would silently turn a working integration into a
//     broken one on a fresh repository.
//
// The issue body includes a hidden marker so a future sync can find the issue it
// created rather than duplicating it.

const API = "https://api.github.com";
const MARKER_PREFIX = "loom-feature-request:";
const TIMEOUT_MS = 10_000;

export function issuesConfig() {
  const repo = String(process.env.GITHUB_ISSUES_REPO || "").trim();
  const token = String(process.env.GITHUB_ISSUES_TOKEN || "").trim();
  const repoValid = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repo);
  const tokenValid = token.length >= 20;
  return {
    configured: repoValid && tokenValid,
    repo: repoValid ? repo : null,
    hasToken: tokenValid,
    token: repoValid && tokenValid ? token : null,
  };
}

/** True when the admin UI should offer the "Create GitHub issue" control. */
export function issuesReady() {
  return issuesConfig().configured;
}

export function issueMarker(id) {
  return `<!-- ${MARKER_PREFIX}${id} -->`;
}

export function formatIssueBody(row, { tenantName, appUrl } = {}) {
  const safeUrl = String(appUrl || "").replace(/\/+$/, "");
  const lines = [
    issueMarker(row.id),
    row.description || "",
    "",
    `- **Category:** ${row.category || "general"}`,
    `- **Chapter:** ${tenantName || "unknown"}`,
    `- **Requested by:** ${row.requester_name || "a member"}`,
    `- **Status in LOOM:** ${row.status || "pending"}`,
  ];
  if (row.integration) lines.push("", "### Integration", row.integration);
  if (row.tradeoffs) lines.push("", "### Trade-offs", row.tradeoffs);
  if (row.implementation) lines.push("", "### Implementation notes", row.implementation);
  lines.push("", `_Synced from LOOM${safeUrl ? ` · ${safeUrl}/admin/feature-requests` : ""}_`);
  return lines.join("\n");
}

function friendly(status) {
  if (status === 401) return "GitHub rejected the token (401). Check GITHUB_ISSUES_TOKEN.";
  if (status === 403) return "GitHub refused the request (403). The token may lack issues:write.";
  if (status === 404) return "Repository or issue not found (404). Check GITHUB_ISSUES_REPO.";
  if (status === 410) return "Issues are disabled on that repository (410).";
  if (status === 422) return "GitHub rejected the issue fields (422).";
  if (status === 429) return "GitHub rate limit reached (429). Try again later.";
  return `GitHub returned ${status}.`;
}

async function call(path, { method = "GET", body } = {}) {
  const cfg = issuesConfig();
  if (!cfg.configured) {
    return { ok: false, code: "NOT_CONFIGURED", message: "GitHub Issues is not configured for this deployment." };
  }
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${cfg.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, code: `GITHUB_${res.status}`, status: res.status, message: friendly(res.status) };
    }
    const data = await res.json().catch(() => null);
    return { ok: true, data };
  } catch (error) {
    const timeout = error?.name === "TimeoutError" || error?.name === "AbortError";
    return {
      ok: false,
      code: timeout ? "GITHUB_TIMEOUT" : "GITHUB_UNREACHABLE",
      message: timeout ? "GitHub did not answer in time." : "Could not reach GitHub.",
    };
  }
}

async function remember(sql, { id, tenantId, issue, error }) {
  const tid = tenantId ?? null;
  if (issue) {
    const [row] = await sql`
      UPDATE feature_requests
      SET github_issue_number = ${issue.number},
          github_issue_url = ${issue.html_url},
          github_issue_repo = ${issue.repo},
          github_issue_state = ${issue.state || "open"},
          github_issue_synced_at = NOW(),
          github_issue_error = NULL
      WHERE id = ${id}::uuid
        AND (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
      RETURNING *
    `;
    return row || null;
  }
  const [row] = await sql`
    UPDATE feature_requests
    SET github_issue_error = ${String(error || "Unknown GitHub error").slice(0, 300)},
        github_issue_synced_at = NOW()
    WHERE id = ${id}::uuid
      AND (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
    RETURNING *
  `;
  return row || null;
}

/**
 * Create the issue for a request that does not have one yet.
 *
 * Returns the updated row (or the original on a no-op) plus a `sync` result the
 * caller can surface. Never throws: the feature request itself is already saved.
 */
export async function syncFeatureRequestToGitHub({
  sql,
  row,
  tenantId,
  tenantName,
  appUrl,
}) {
  if (!row?.id) return { ok: false, code: "NO_ROW", row };
  const cfg = issuesConfig();
  if (!cfg.configured) return { ok: false, code: "NOT_CONFIGURED", row };

  try {
    if (row.github_issue_number) {
      const res = await call(`/repos/${cfg.repo}/issues/${row.github_issue_number}`);
      if (!res.ok) {
        const updated = await remember(sql, { id: row.id, tenantId, error: res.message });
        return { ...res, row: updated || row };
      }
      const updated = await remember(sql, {
        id: row.id,
        tenantId,
        issue: { ...res.data, repo: cfg.repo },
      });
      return { ok: true, row: updated || row };
    }

    const res = await call(`/repos/${cfg.repo}/issues`, {
      method: "POST",
      body: {
        title: `[Feature] ${String(row.title || "Untitled idea").slice(0, 200)}`,
        body: formatIssueBody(row, { tenantName, appUrl }),
      },
    });
    if (!res.ok) {
      const updated = await remember(sql, { id: row.id, tenantId, error: res.message });
      return { ...res, row: updated || row };
    }
    const updated = await remember(sql, {
      id: row.id,
      tenantId,
      issue: { ...res.data, repo: cfg.repo },
    });
    return { ok: true, row: updated || row };
  } catch {
    // A DB failure after a successful create is possible; report it without
    // pretending the link exists.
    return { ok: false, code: "SYNC_FAILED", message: "Saved, but the GitHub link could not be stored.", row };
  }
}

/**
 * Mirror a status decision onto the linked issue.
 *
 * built     -> close (completed) + comment
 * rejected  -> close (not planned) + comment
 * everything else -> reopen so the issue reflects work that is live in LOOM
 *
 * Best-effort and silent: a notification about a status change must never fail
 * because GitHub is slow.
 */
export async function syncStatusToGitHub({ sql, row, tenantId, status, note }) {
  if (!row?.github_issue_number) return { ok: false, code: "NOT_LINKED" };
  const cfg = issuesConfig();
  if (!cfg.configured) return { ok: false, code: "NOT_CONFIGURED" };

  const path = `/repos/${cfg.repo}/issues/${row.github_issue_number}`;
  try {
    if (status === "built" || status === "rejected") {
      const closed = await call(path, {
        method: "PATCH",
        body: {
          state: "closed",
          state_reason: status === "built" ? "completed" : "not_planned",
        },
      });
      if (!closed.ok) {
        await remember(sql, { id: row.id, tenantId, error: closed.message });
        return closed;
      }
      await call(`${path}/comments`, {
        method: "POST",
        body: {
          body: status === "built"
            ? `Shipped in LOOM.${note ? `\n\n${note}` : ""}`
            : `Not moving forward in LOOM.${note ? `\n\n${note}` : ""}`,
        },
      });
    } else {
      const reopened = await call(path, { method: "PATCH", body: { state: "open" } });
      if (!reopened.ok) {
        await remember(sql, { id: row.id, tenantId, error: reopened.message });
        return reopened;
      }
    }
    await remember(sql, {
      id: row.id,
      tenantId,
      issue: {
        number: row.github_issue_number,
        html_url: row.github_issue_url,
        repo: cfg.repo,
        state: status === "built" || status === "rejected" ? "closed" : "open",
      },
    });
    return { ok: true };
  } catch {
    return { ok: false, code: "SYNC_FAILED", message: "Issue state could not be updated." };
  }
}
