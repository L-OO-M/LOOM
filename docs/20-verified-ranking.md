# 20 — Verified ranking

> How the leaderboard decides a student is ranked, and why nothing a student
> says about themselves can move it.

---

## 1. The problem this document exists to record

Until September 2026 the standings board scored raw rows:

```
score = commits × 5 + pull_requests × 20 + completed_roadmap_nodes × 30 + non_archived_projects × 25
```

Only the first two terms were attested by anything. The other two were counts of
rows in tables the student writes with a single POST:

| Request | Points | Checks it passed |
|---|---|---|
| `POST /api/projects {"title":"x"}` | **+25** | title ≥ 3 chars |
| `POST /api/roadmap/progress {"status":"completed"}` | **+30** | node exists |

Neither endpoint had a rate limit, a per-owner cap, or any requirement of proof.
So **55 of every 100 points were self-issued in under a minute**, and the two
highest-weight terms were the two easiest to fake — the formula was inverted.

The damage did not stay on the board. Roadmap completion also minted real
`student_achievements` rows (`maybeAwardMilestone`), which feed:

- `lib/reputation.js` — +10 per achievement,
- `lib/mentorship.js` — the mentor candidacy bar,
- `/student/credentials` and the **public** `/verify/credential/[id]` page.

One click therefore bought a public credential, reputation, and eligibility to
mentor juniors. The cheapest possible action was the highest-leverage action in
the system.

Two further holes in the same family:

- `student_daily_activity` was upserted **additively** with no idempotency, so a
  redelivered signed webhook payload added the same commits twice.
- `PATCH /api/profile` accepted `githubUsername`, a second unguarded writer for
  `profiles.github_username`. Since `resolveStudentIdByLogin` falls back to that
  column, a student could point the mirror at another member's handle and
  **absorb their pushes and pull requests as their own score**.

---

## 2. The rule now

> **A point exists only if something a student does not control can vouch for it.**

Exactly two things can vouch:

1. **A signed GitHub delivery.** HMAC-verified with the chapter's webhook
   secret, so it cannot be manufactured by the student. Attested at ingest into
   `student_daily_activity`.
2. **A named human or a system rule**, recorded in `ranking_events` with a
   `verified_by` value — a lead confirming a milestone, an admin judging a
   contest, the webhook proving a merge landed.

Anything else does not score.

### Enforcement is in the database, not the route

Migration 037 installs a `BEFORE INSERT` trigger on `ranking_events` that raises
on `verified_by IS NULL` or blank. It fires for **every role including the
migration owner**, so neither a buggy route nor a `psql` session can write an
unvouched score.

This matters more than it might seem. Migration 027 already had the right column
and it was not enough: `verified_by` was nullable, no caller passed it, and
`recompute_ranking_scores` summed verified and unverified rows identically. The
failure was never a missing column — it was a missing constraint.

`lib/ranking.js:recordEvidence` requires `verifiedBy` with no default, so a
caller who forgets gets a `TypeError` at the call site rather than a silently
unscored row. Errors propagate; the 027 writer swallowed them with `catch {}`,
which made a failed award indistinguishable from a successful one.

---

## 3. What counts, and what it is worth

Weights live in `lib/ranking.js`; per-kind caps in the same file and in
`public.ranking_kind_cap()`. The student-facing disclosure on
`/student/leaderboard` is generated from the same constants, so it cannot drift.

| Evidence | Weight | Cap | Vouched by |
|---|---|---|---|
| Merged open-source PR | 30 | 15 | Signed merge delivery, or admin |
| Contest result | 25 | 5 | Admin, after judging |
| Verified project | 20 | 10 | Signed delivery from that repository |
| Confirmed roadmap milestone | 18 | 40 | Prerequisites met + lead confirmed |
| Pull request opened | 12 | 10 | Signed delivery |
| Accepted community answer | 8 | 15 | Another member marked it |
| Event attended | 3 | 20 | Chapter check-in |
| Commit | 2 | 20 | Signed delivery |
| Resource ticked "done" | **0** | — | Nothing. It is a self-report. |

The old formula's direction is inverted: externally produced, independently
checkable work leads the board, and raw volume is worth almost nothing.

**Caps are hard plateaus.** The first N count in full; everything past N is worth
exactly zero. A soft 10% tail was implemented and then removed — with a commit
worth 2, "10% past the cap" floors to 0 for one kind and 1 for another, so the
rule disclosed to students and the score computed could disagree. A ceiling is
also easier to state honestly and removes the incentive to pad.

**Decay.** `ranking_decayed_weight` was declared `IMMUTABLE` while calling
`now()`, which permits the planner to constant-fold a time-dependent value. It is
now `STABLE`, and the single permanent 0.7× step after 90 days is a real curve:
full → 0.8 at 90d → 0.6 at 180d → 0.4 at 365d, never below 1.

---

## 4. The claim pipeline

### Roadmap milestone

1. `POST /api/roadmap/progress` checks prerequisites against `roadmap_edges`.
   Only `kind = 'required'` blocks; `optional` and `alternative` are routes
   around a node, not walls. A node marked `is_optional` is never blocked.
   **On failure the API returns the specific outstanding node titles** — a
   student who worked ahead of the graph should be able to fix it without
   guessing.
2. The claim is stored as `evidence_state = 'provisional'`. It scores **zero**.
3. Chapter leads are notified. The student keeps working; nothing waits on them.
4. `/admin/ranking` → Confirm writes `ranking_events` with `verified_by`, or
   Decline deletes any such row and recomputes.

Re-claiming a node returns it to provisional, so a student cannot confirm once
and then edit the evidence while keeping the standing it earned.

### Project

1. `repo_url` is **required** and must parse as `github.com/owner/repo`.
2. The owner must match the student's claimed `github_username`, and one
   repository can be claimed once.
3. The project is created `provisional` and scores zero.
4. A signed `push` or `pull_request` delivery whose `repository.full_name`
   matches, authored by that student, promotes it to `verified` and writes
   `project_verified`. Changing the repo URL returns it to provisional.

> **Honest limit.** There is no GitHub OAuth in this project, so a repository's
> owner can only be *asserted*, not proven. And activation only fires for
> repositories whose owner has pointed a webhook at this deployment — nothing can
> install one on a student's behalf. A project in a repo with no webhook stays
> provisional and is confirmed by hand in `/admin/ranking`. That queue is
> therefore load-bearing, not a nicety.

### Everything downstream trusts `verified`

`lib/tiers.js`, `lib/mentorship.js`, `lib/reputation.js` and `lib/recommend.js`
all filter on `evidence_state = 'verified'` or `status = 'verified'`. This is not
tidiness: tiers decide who is offered mentoring and which juniors get paired,
reputation feeds shareable credentials, and help-matching routes students to
someone as a mentor. The same forgery that inflated the board would otherwise
have decided who mentors whom.

---

## 5. The review queue

`/admin/ranking`, backed by `app/api/admin/ranking/route.js`, gated on the new
`verify_evidence` permission — the first review-shaped action in
`lib/permissions.js`, granted to `admin`/`platform_admin` by the existing
`r >= RANK.admin` short-circuit.

It is deliberately **not** a blocking approval workflow. The previous design
needed no queue at all, which is precisely why it could be faked; but a queue that
gates progress would trade a fake leaderboard for a stalled one, and leads would
learn to rubber-stamp. So:

- claims never wait — they sit at zero until confirmed;
- evidence is inlined, no navigation per item;
- **"Clear every unverified claim for this student"** is a separate action with
  its own confirmation, because it is the one that actually costs something.

Everything is reversible. Scores are **derived, never incremented**:
`recompute_ranking_scores` recomputes from verified rows and deletes rows for
users with no verified evidence left, so declining a claim genuinely lowers a
standing.

---

## 6. Rollout

`feature_flags.ranking_verified`, default **off**, seeded by migration 037 and
toggled at `/admin/flags`.

Off by default because every current standing was computed from self-declared
rows; flipping it on retroactively withdraws points students were shown as
having earned. The chapter picks the moment. With it off, `/student/leaderboard`
says so explicitly rather than rendering an empty board that reads as "nobody has
done anything".

Migration 037 backfills existing `projects` rows to `provisional`, **not**
`verified` — every one of them was written by the student, so none was ever
vouched for.

---

## 7. Data model

`ranking_scores` was keyed on `user_id` alone (`user_id PRIMARY KEY`,
`tenant_id` carried as a plain column) and recomputed with
`ON CONFLICT (user_id)` that never refreshed `tenant_id`. A user id present in
two chapters had **one row overwritten in place** by the other chapter's
recompute. Migration 037 makes the key `(tenant_id, user_id)` and fixes the
conflict target.

`ranking_events` gains `source` (`webhook` | `admin` | `system`), `evidence`
(jsonb) and `verified_at`. Verification actors use the same idiom as the webhook
audit trail: `github:<login>` for a signed delivery, a user id for an admin.
System verification names what actually caused it rather than inventing an actor.

`github_events` gains `repository_name`, `student_id` and `tenant_id` with a
partial index, so "which repositories does this student have signed deliveries
for?" is an index scan rather than a scan over a jsonb payload.

---

## 8. Tests

| File | What it pins |
|---|---|
| `tests/ranking.test.js` | The ledger refuses a missing/blank verifier; weights are inverted; caps plateau; prerequisite rules; cycle detection; repo-URL parsing and ownership. |
| `tests/verified-evidence-gate.test.js` | The migration's **contract as source text** — the trigger exists, is `BEFORE INSERT`, has no privileged-session escape hatch, and `verified_by` is never made nullable again. |
| `tests/ranking-exploit.test.js` | The 60-second attack, written down: bulk project creation, bulk roadmap completion, and stealing another member's activity. |
| `tests/standings.test.js` | No parameter exists through which a self-declared claim could score. |

The source-text assertions strip comments before matching. That matters: this
codebase is heavily commented and the comments necessarily *name* the banned
things, so asserting on raw source would match the explanation of the fix rather
than the fix — the worst failure mode for a regression test, because it looks
armed and is not.

---

## 9. What this does not solve

> **Update — resolved by migration 038.** The ownership gap below was closed after
> this document was first written. GitHub OAuth now asks GitHub directly whether
> a student can push to a repository, and stores that answer in
> `github_repo_grants`; a claim on a proven repository verifies immediately,
> with no delivery required. The webhook auto-install closes the setup gap too.
> See [`docs/21-github-oauth-setup.md`](21-github-oauth-setup.md). The remaining
> items below still stand.

- ~~**Repo ownership is asserted, not proven.** No OAuth. A student who claims
  a handle they do not control can claim that handle's repositories.~~ **Fixed**
  by the repository grant.
- ~~**Webhook activation needs a webhook.** Repositories without one fall to
  manual review~~ **Fixed** — the callback installs the hook automatically when
  the student holds admin on the repo.
- **A reviewer can rubber-stamp.** The queue is fast by design, which is
  deliberate; the audit log and the per-student reversal are the accountability,
  not the volume control.
- **Caps are a judgement call.** They are constants in one file and one SQL
  function, and the two must be changed together.