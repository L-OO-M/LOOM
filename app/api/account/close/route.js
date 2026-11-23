import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  CLOSURE_PHRASE,
  ERASED_IDENTITY_FIELDS,
  closureBlockers,
  isClosurePhrase
} from "@/lib/account-closure";

// Self-service account closure.
//
// The request is the person's own, so there is no third party to convince: the
// guards are about what the chapter would lose (an admin or a live Head seat)
// and about making an irreversible-feeling action deliberate. A typed phrase is
// required, the profile keeps its id, and identity fields are erased rather
// than the row deleted -- see migration 104 and lib/account-closure.js.
//
// Writes that must agree (profile, public card, departures, open requests) run
// in one transaction. Notifications are removed because they belong to the
// closed account and nobody can read them any more.

const schema = z.object({
  confirm: z.string().min(1).max(64).refine(isClosurePhrase, {
    message: `Type “${CLOSURE_PHRASE}” to confirm.`
  }),
  reason: z.string().trim().max(500).optional().nullable()
});

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "ACCOUNT_DEACTIVATED") {
    return fail("ALREADY_CLOSED", "This account is already closed", 409);
  }
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;

  const limited = checkRateLimit(`account-close:${user.id}`, { limit: 3, windowMs: 60 * 60_000 });
  if (!limited.ok) return fail("RATE_LIMITED", "Too many attempts. Try again later.", 429);

  let body;
  try {
    body = schema.parse(await request.json());
  } catch (error) {
    return validationError(error);
  }

  const blocked = closureBlockers(profile);
  if (blocked.length > 0) {
    return fail(blocked[0].code, blocked[0].message, blocked[0].status);
  }

  const reason = body.reason || null;

  await sql.begin(async (tx) => {
    await tx`
      UPDATE profiles
      SET account_status = 'deactivated',
          status_reason = ${reason || "Closed by the account holder"},
          status_changed_at = NOW(),
          status_changed_by = ${user.id},
          role = 'student',
          role_term_end = NULL,
          vertical = NULL,
          name = 'Former member',
          enrollment_number = NULL,
          roll_number = NULL,
          branch = NULL,
          department = NULL,
          year = NULL,
          institution = NULL,
          location = NULL,
          github_username = NULL,
          onboarding_completed = false,
          closed_at = NOW(),
          closed_reason = ${reason},
          updated_at = NOW()
      WHERE user_id = ${user.id} AND tenant_id = ${tenant.id}::uuid
    `;

    // The public card and the GitHub link are the two places another person can
    // still reach them by name. Deleting the card also frees the handle.
    await tx`DELETE FROM user_profiles WHERE user_id = ${user.id} AND tenant_id = ${tenant.id}::uuid`;
    await tx`DELETE FROM github_connections WHERE user_id = ${user.id}`;

    // Seats go with the account. Audit and work rows keep the id, which is the
    // whole point of a closure rather than a delete.
    await tx`DELETE FROM department_memberships WHERE user_id = ${user.id} AND tenant_id = ${tenant.id}::uuid`;

    // A closed account must not stay bookable as a mentor. Past sessions keep
    // their mentor_id: they are the chapter's record of work already done.
    await tx`DELETE FROM mentors WHERE user_id = ${user.id} AND tenant_id = ${tenant.id}::uuid`;

    // Nobody can decide a request from a closed account, and a waiting applicant
    // should not sit in a queue that can never complete.
    await tx`
      UPDATE role_requests
      SET status = 'withdrawn', decided_at = NOW(),
          decision_reason = 'Withdrawn: the applicant closed their account.'
      WHERE user_id = ${user.id} AND tenant_id = ${tenant.id}::uuid AND status = 'open'
    `;

    await tx`DELETE FROM notifications WHERE user_id = ${user.id}`;
  });

  await writeAudit({
    sql,
    actorId: user.id,
    tenantId: tenant.id,
    action: "account.closed",
    resource: "profile",
    resourceId: user.id,
    before: { account_status: "active", role: profile.role },
    after: {
      account_status: "deactivated",
      erased: ERASED_IDENTITY_FIELDS,
      reason,
      self_service: true
    },
    authorizationContext: { source: "self_service_account_close" }
  });

  return ok({ closed: true });
}
