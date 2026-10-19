import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Migration 037 is the actual control. lib/ranking.js refusing an unverified
// write is good hygiene, but it is application code and can be bypassed by a
// future route, a migration, or a psql session on the owner role. The trigger
// is what makes the guarantee hold for every role.
//
// So this suite pins the migration's CONTRACT as source text. It cannot prove the
// SQL executes correctly without a database, but it does prove the guarantee
// cannot be quietly deleted or weakened by an edit, which is the failure mode
// that matters.
const MIGRATION = join(process.cwd(), "load", "migrations", "037_verified_evidence.sql");
const sql = readFileSync(MIGRATION, "utf8");

describe("the ledger rejects unverified evidence at the database", () => {
  it("installs a BEFORE INSERT trigger, so it cannot be bypassed by an UPDATE", () => {
    expect(sql).toMatch(/CREATE TRIGGER\s+ranking_events_require_verification[\s\S]*BEFORE INSERT ON public\.ranking_events/);
  });

  it("raises when verified_by is missing or blank", () => {
    const fn = sql.slice(sql.indexOf("ranking_reject_unverified"));
    expect(fn).toMatch(/NEW\.verified_by IS NULL OR btrim\(NEW\.verified_by\) = ''/);
    expect(fn).toMatch(/RAISE EXCEPTION/);
  });

  it("does not leave an escape hatch for a privileged session", () => {
    // The whole point is that the owner role is covered too. A guard written as
    // "unless current_user is the owner" would restore the original hole, so the
    // text must contain no such condition.
    const fn = sql.slice(sql.indexOf("ranking_reject_unverified"), sql.indexOf("DROP TRIGGER"));
    expect(fn).not.toMatch(/current_user|session_user|rolsuper|rolbypassrls/i);
  });

  it("does not make verified_by nullable again", () => {
    // 027 declared it nullable and nothing enforced it. A DROP NOT NULL
    // reintroduced here would undo the guarantee at the column level.
    expect(sql).not.toMatch(/ALTER COLUMN verified_by DROP NOT NULL/i);
  });
});

describe("scores are derived, never incremented", () => {
  it("recomputes from verified rows only", () => {
    const fn = sql.slice(sql.indexOf("recompute_ranking_scores"));
    expect(fn).toMatch(/verified_by IS NOT NULL/);
  });

  it("reverses a declined claim instead of leaving the score frozen", () => {
    // Without this DELETE, rejecting evidence in the review queue would not
    // lower anybody's standing -- the board would keep the last computed value.
    const fn = sql.slice(sql.indexOf("recompute_ranking_scores"));
    expect(fn).toMatch(/DELETE FROM public\.ranking_scores/);
  });

  it("keys scores per tenant, closing the cross-tenant overwrite", () => {
    // 027 keyed on user_id alone and updated without refreshing tenant_id, so a
    // user id present in two chapters had one row overwritten in place.
    expect(sql).toMatch(/PRIMARY KEY \(tenant_id, user_id\)/);
    const fn = sql.slice(sql.indexOf("recompute_ranking_scores"));
    expect(fn).toMatch(/ON CONFLICT \(tenant_id, user_id\)/);
  });

  it("applies the caps when scoring", () => {
    expect(sql).toMatch(/ranking_kind_cap/);
  });

  it("declares the decay function STABLE, not IMMUTABLE", () => {
    // 027 declared a function IMMUTABLE while it calls now(), which permits the
    // planner to constant-fold a time-dependent value. Assert on the
    // declaration itself, not on the file: the prose above it mentions
    // IMMUTABLE by name while explaining the old bug.
    const decl = sql.match(/CREATE OR REPLACE FUNCTION public\.ranking_decayed_weight[\s\S]*?\$\$;/);
    expect(decl).not.toBeNull();
    expect(decl[0]).toMatch(/LANGUAGE sql STABLE/);
    expect(decl[0]).not.toMatch(/LANGUAGE sql IMMUTABLE/);
  });
});

describe("the release flag", () => {
  it("defaults ranking_verified off", () => {
    // Flipping it on retroactively withdraws points students were shown as
    // having earned, so the safe default must be off.
    expect(sql).toMatch(/'ranking_verified',\s*false/);
  });

  it("does not overwrite a chapter's existing choice on re-run", () => {
    expect(sql).toMatch(/WHERE NOT EXISTS/);
  });
});

describe("no table is trusted as verified by default", () => {
  it("backfills existing self-declared projects to provisional, not verified", () => {
    // Every pre-existing project row was written by the student, so none of it
    // was ever vouched for. Backfilling to 'verified' would launder exactly the
    // rows this migration exists to distrust.
    expect(sql).toMatch(/UPDATE public\.projects SET evidence_state = 'provisional'/);
    expect(sql).not.toMatch(/UPDATE public\.projects SET evidence_state = 'verified'/);
  });

  it("adds a verification state to roadmap progress too", () => {
    expect(sql).toMatch(/student_roadmap_progress ADD COLUMN IF NOT EXISTS evidence_state/);
  });

  it("constrains the verification states so an unknown one cannot be stored", () => {
    expect(sql).toMatch(/CHECK \(evidence_state IN \('provisional', 'verified', 'rejected'\)\)/);
  });
});

describe("attested repositories are an indexed lookup", () => {
  it("records the repository and attributed student on the event", () => {
    // Activation and the review queue both need "which repos does this student
    // have signed deliveries for?" to be cheap, not a jsonb scan.
    expect(sql).toMatch(/github_events ADD COLUMN IF NOT EXISTS repository_name/);
    expect(sql).toMatch(/github_events ADD COLUMN IF NOT EXISTS student_id/);
    expect(sql).toMatch(/github_events_attested_repo_idx/);
  });

  it("backfills existing rows rather than starting from nothing", () => {
    expect(sql).toMatch(/payload->'repository'->>'full_name'/);
  });
});