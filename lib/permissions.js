/**
 * Permissions — the Website Plan's Section 3 matrix, as data.
 *
 * Five levels: student (General) < core < dept_lead (Head = Co-Head, one
 * tier) < vertical_lead < admin (Super Admin). platform_admin implies admin.
 *
 * can(user, action, scope) -> { ok, note }. `note` carries the matrix's
 * yellow cells: needs_approval, needs_signoff, recommend_only, suggest_only,
 * view_only, limited (name+dept directory), own_feed, own_only.
 *
 * user:  { id, role, vertical: 'technical'|'non_technical'|null,
 *          memberships: [{ department_id, level, department_slug }] }
 * scope: { departmentId?, departmentSlug?, vertical?, eventId?, ownerId?, approvalStatus? }
 *
 * Pure function — no DB. Callers load memberships and pass them in.
 * (getRequestContext membership attachment lands with the membership APIs.)
 */

export const ROLES = ["student", "core", "dept_lead", "vertical_lead", "admin", "platform_admin"];

const RANK = { student: 0, core: 1, dept_lead: 2, vertical_lead: 3, admin: 4, platform_admin: 5 };

// All recognized actions. New actions must be added here AND handled in can().
export const ACTIONS = [
  // --- Core membership & content ---
  "manage_users",              // change roles/departments, deactivate (admin only)
  "edit_dept_content",         // roadmap, resources, workshop calendar (dept-scoped)
  "create_event_documentation",// event records, reports, minutes (Documentation dept)
  "upload_roadmap",            // legacy: roadmap upload (dept-scoped)

  // --- Events ---
  "post_event_society",        // society-wide events (vertical/admin; dept_lead needs approval)
  "post_workshop_dept",        // own-dept workshops
  "manage_event_tasks",        // assign/track event tasks (Management + assigned)
  "view_assigned_event_tasks", // view own assigned event tasks (all depts)
  "approve_event",             // approve society events (vertical/admin)
  "check_in_attendees",        // run the door for own department's event (dept head, vertical, admin)

  // --- Finance & Budgets ---
  "approve_budget",            // approve budgets (admin only)
  "view_event_budget",         // view event budget (Sponsorship, Management, Documentation)
  "manage_sponsorship_finance",// sponsorship commitments, deliverables (Sponsorship dept)
  "view_finance",              // legacy: finance records (vertical leads + admin)

  // --- People & Mentorship ---
  "assign_mentor",             // match mentors to juniors (vertical + dept_lead own dept)
  "log_contribution",          // log member's project/competition work

  // --- Profile & Registration ---
  "register_event",            // register for events (everyone)
  "submit_project",            // submit projects (everyone)
  "edit_own_profile",          // edit own profile (everyone)

  // --- Rosters & Directory ---
  "view_roster",               // department roster (dept head own dept, vertical own vertical)
  "view_directory",            // society-wide member directory (vertical full, dept_lead limited)

  // --- Announcements ---
  "draft_announcement",        // draft announcement (all leads)
  "publish_announcement",      // publish society-wide (admin only)
  "post_announcement",         // legacy: dept_lead own feed, vertical society-wide

  // --- Static Content ---
  "edit_static",               // About Us / static pages (admin)
  "manage_faq",                // FAQ content (vertical suggest_only)

  // --- Moderation ---
  "suspend_member",            // remove/suspend member (vertical needs_signoff)

  // --- Reports ---
  "export_reports",            // semester/annual reports (vertical own vertical, dept_lead own dept)

  // --- Advisor ---
  "manage_advisor",            // faculty advisor communications (vertical view_only)

  // --- Evidence ---
  "verify_evidence",           // confirm/refuse claimed evidence (admin only)

  // --- Help ---
  "help:request",              // help request (everyone)

  // --- Lead Tools (MoU, Directory, Event Ops, Assets) ---
  "view_lead_tools",           // read lead-section records (dept_lead+, core view_only)
  "manage_mou",                // create/edit MoU records (Sponsorship, PR, vertical, admin)
  "manage_leads",              // DEPRECATED: use manage_sponsorship_leads / manage_outreach_leads
  "manage_sponsorship_leads",  // sponsor CRM, pipeline (Sponsorship dept)
  "manage_outreach_leads",     // external contacts, partnerships (PR dept)
  "manage_promotional_campaigns", // promotional campaigns (Publicity dept)
  "manage_social_content",     // social media content, calendars (SMM dept)
  "manage_event_ops",          // event guests, contacts, tasks, deadlines (Management dept)
  "view_assets",               // browse/download asset library (dept_lead+)
  "manage_assets",             // upload/edit/version assets (Design, SMM depts)
  "manage_contests",           // chapter challenges (technical dept_lead+, admin)
  "manage_handover",           // leadership handover (dept_lead+, admin)
];

const ok = (note = null) => ({ ok: true, note });
const no = (note = null) => ({ ok: false, note });

function rank(role) {
  return RANK[role] ?? -1;
}

function isoDay(value) {
  return value ? String(value).slice(0, 10) : null;
}

/** A term that ended before today is over. NULL means grandfathered. */
export function termExpired(termEnd) {
  const end = isoDay(termEnd);
  if (!end) return false;
  return end < new Date().toISOString().slice(0, 10);
}

/**
 * The role that actually governs this request. A non-founder whose term has
 * ended keeps the title for history but falls back to `core`: authority is
 * suspended until an admin reappoints or extends the term. Founder platform
 * admins never expire.
 */
export function effectiveRole(user) {
  if (!user?.role) return null;
  if (user.isPlatformAdmin || user.role === "platform_admin") return user.role;
  if (rank(user.role) >= RANK.core && termExpired(user.roleTermEnd)) return "core";
  return user.role;
}

/** True when the account still has a live leadership term. */
export function hasLiveTerm(user) {
  return !termExpired(user?.roleTermEnd);
}

function findMembership(user, departmentId) {
  if (!departmentId || !Array.isArray(user?.memberships)) return null;
  return user.memberships.find((m) => m.department_id === departmentId) ?? null;
}

/**
 * Membership rows carry the department slug as `slug` from the auth query and
 * historically as `department_slug` in hand-built fixtures. Read either: the
 * permission matrix was shipped reading only `department_slug`, so against real
 * sessions every department-specific check denied its own head.
 */
function membershipSlug(m) {
  return m?.department_slug ?? m?.slug ?? null;
}

/** Membership level, with an expired dept_lead position downgraded to core. */
export function memberLevel(user, departmentId) {
  const m = findMembership(user, departmentId);
  if (!m) return null;
  if (m.level === "dept_lead" && termExpired(m.term_end)) return "core";
  return m.level;
}

/** Department slug from membership (for dept-specific permissions). */
export function memberDepartmentSlug(user, departmentId) {
  const m = findMembership(user, departmentId);
  if (!m) return null;
  return membershipSlug(m);
}

/** Vertical of the department a member belongs to (auth context attaches it). */
export function memberVertical(user, departmentId) {
  return findMembership(user, departmentId)?.vertical ?? null;
}

/**
 * Scope a page or route needs so a vertical lead's authority applies to their
 * own vertical. Department heads do not get this: their authority is tied to a
 * department membership, never to the vertical label on their profile.
 */
export function profileScope(profile) {
  return profile?.role === "vertical_lead" && profile?.vertical ? { vertical: profile.vertical } : {};
}

/**
 * The vertical a scoped action belongs to. Callers may pass `vertical`
 * directly (society-wide scope) or a `departmentId`, in which case the
 * membership's department vertical is used.
 */
export function scopeVertical(user, scope = {}) {
  return scope.vertical || memberVertical(user, scope.departmentId) || null;
}

/** Live department-head memberships (term not expired). */
function liveLeadMemberships(user) {
  if (!Array.isArray(user?.memberships)) return [];
  return user.memberships.filter((m) => m.level === "dept_lead" && !termExpired(m.term_end));
}

/**
 * Resolve the department an action is about.
 *
 * Explicit scope always wins. When a caller does not name a department, a head
 * who leads exactly one department is unambiguously acting for that one — which
 * is the normal case and is what lets the Lead console's tool buttons work.
 * A head of several departments is *not* guessed: they must name one, so an
 * action can never land on the wrong department.
 */
function resolveDepartment(user, scope = {}) {
  const namesDepartment = "departmentId" in scope || "departmentSlug" in scope;
  if (scope.departmentId) {
    const m = findMembership(user, scope.departmentId);
    return { id: scope.departmentId, slug: membershipSlug(m), member: m };
  }
  if (scope.departmentSlug) {
    const m = (user?.memberships ?? []).find((x) => membershipSlug(x) === scope.departmentSlug);
    return { id: m?.department_id ?? null, slug: scope.departmentSlug, member: m ?? null };
  }
  // An explicit `departmentId: null` means "not a department" (a society-wide
  // event, for example). Do not fall back to the caller's own department.
  if (namesDepartment) return { id: null, slug: null, member: null };
  const leads = liveLeadMemberships(user);
  if (leads.length === 1) {
    return { id: leads[0].department_id ?? null, slug: membershipSlug(leads[0]), member: leads[0] };
  }
  return { id: null, slug: null, member: null };
}

function isLiveLead(dept) {
  return !!dept?.member && dept.member.level === "dept_lead" && !termExpired(dept.member.term_end);
}

/** Check if user is a dept_lead of a specific department slug. */
export function isDeptLeadOf(user, departmentSlug) {
  if (!user?.memberships) return false;
  return user.memberships.some(m =>
    m.level === "dept_lead" &&
    !termExpired(m.term_end) &&
    membershipSlug(m) === departmentSlug
  );
}

/** Check if user is a dept_lead of a specific department ID (requires slug in membership). */
export function isDeptLeadOfId(user, departmentId, departmentSlug) {
  if (!user?.memberships) return false;
  return user.memberships.some(m =>
    m.level === "dept_lead" &&
    !termExpired(m.term_end) &&
    m.department_id === departmentId &&
    membershipSlug(m) === departmentSlug
  );
}

/** Get the department slug for a dept_lead membership. */
export function getDeptLeadSlug(user, departmentId) {
  return membershipSlug(findMembership(user, departmentId));
}

/** Resolve department slug from scope or membership. */
function resolveDeptSlug(user, scope) {
  if (scope.departmentSlug) return scope.departmentSlug;
  if (scope.departmentId) return memberDepartmentSlug(user, scope.departmentId);
  return null;
}

export function can(user, action, scope = {}) {
  if (!user || !ACTIONS.includes(action)) return no();
  const role = effectiveRole(user);
  const r = rank(role);
  if (r < 0) return no();

  // Deprecated actions: even admin gets a deprecation note
  if (action === "manage_leads") {
    if (r >= RANK.admin) return ok("deprecated: use manage_sponsorship_leads or manage_outreach_leads");
    return no("deprecated: use manage_sponsorship_leads or manage_outreach_leads");
  }

  // Super Admin: unrestricted. Platform admin inherits.
  if (r >= RANK.admin) return ok();

  // Which department is this action about? Explicit scope wins; a head who
  // leads exactly one department is acting for it even when the caller did not
  // name it (the common case for the Lead console). A head of several
  // departments must name one — see resolveDepartment.
  const dept = resolveDepartment(user, scope);
  const vertical = scopeVertical(user, scope) || dept.member?.vertical || null;
  const ownVertical = !!vertical && !!user.vertical && user.vertical === vertical;

  // Helper: is user a dept_lead for the scoped department?
  const deptId = dept.id;
  const deptSlug = dept.slug;
  const isOwnDeptLead = isLiveLead(dept);
  const isOwnDeptLeadSlug = isOwnDeptLead && !!deptSlug;

  // Helper: is user in a specific non-technical department as dept_lead?
  const isDesignLead = isOwnDeptLeadSlug && deptSlug === "design";
  const isDocumentationLead = isOwnDeptLeadSlug && deptSlug === "documentation";
  const isSMMLead = isOwnDeptLeadSlug && deptSlug === "smm_content";
  const isPublicityLead = isOwnDeptLeadSlug && deptSlug === "publicity";
  const isSponsorshipLead = isOwnDeptLeadSlug && deptSlug === "sponsorship";
  const isManagementLead = isOwnDeptLeadSlug && deptSlug === "management";
  const isPRLead = isOwnDeptLeadSlug && deptSlug === "public_relations";

  // Helper: is user in a technical department as dept_lead?
  const isTechnicalDeptLead = isOwnDeptLeadSlug && [
    "ai_ml", "web", "cybersecurity", "dsa", "blockchain", "embedded"
  ].includes(deptSlug);

  // Helper: is user any dept_lead (for dept-wide permissions like view_directory)
  const isAnyDeptLead = user.memberships?.some(m =>
    m.level === "dept_lead" && !termExpired(m.term_end)
  ) ?? false;

  switch (action) {
    case "manage_users":
      return no();

    case "edit_dept_content":
    case "upload_roadmap":
      if (role === "vertical_lead" && ownVertical) return ok();
      if (isOwnDeptLead) return ok();
      return no();

    case "create_event_documentation":
      if (isDocumentationLead) return ok();
      if (role === "vertical_lead" && ownVertical) return ok();
      if (role === "admin") return ok();
      return no();

    case "post_event_society":
      if (role === "vertical_lead") return ok();
      if (role === "admin") return ok();
      if (isOwnDeptLead) return { ok: true, note: "needs_approval" };
      return no();

    case "post_workshop_dept":
      if (role === "vertical_lead" && ownVertical) return ok();
      if (isOwnDeptLead) return ok();
      return no();

    case "manage_event_tasks":
      if (isManagementLead) return ok();
      if (role === "vertical_lead" && ownVertical) return ok();
      if (role === "admin") return ok();
      return no();

    case "view_assigned_event_tasks":
      if (role === "vertical_lead" && ownVertical) return ok();
      if (role === "admin") return ok();
      if (isOwnDeptLead) return ok("own_only");
      return no();

    case "approve_event":
      if (role === "vertical_lead") return ok();
      if (role === "admin") return ok();
      return no();

    case "check_in_attendees":
      // The door is run by the department that owns the event (either head),
      // the lead of that vertical, or an admin. A department head is not a
      // door pass for every event in the society.
      if (isOwnDeptLead) return ok();
      if (role === "vertical_lead" && ownVertical) return ok();
      return no();

    case "approve_budget":
      if (role === "vertical_lead") return no("recommend_only");
      return no();

    case "view_event_budget":
      if (isSponsorshipLead || isManagementLead || isDocumentationLead) return ok();
      if (role === "vertical_lead" && ownVertical) return ok();
      if (role === "admin") return ok();
      return no();

    case "manage_sponsorship_finance":
      if (isSponsorshipLead) return ok();
      if (role === "vertical_lead" && ownVertical) return ok("recommend_only");
      if (role === "admin") return ok();
      return no();

    case "view_finance":
      if (role === "vertical_lead" && ownVertical) return ok();
      if (role === "admin") return ok();
      return no();

    case "assign_mentor":
      if (role === "vertical_lead" && ownVertical) return ok();
      if (isOwnDeptLead) return ok();
      return no();

    case "log_contribution":
      if (role === "vertical_lead" && ownVertical) return ok();
      if (isOwnDeptLead) return ok();
      if (role === "core" && scope.ownerId && scope.ownerId === user.id) return ok("own_only");
      return no();

    case "register_event":
    case "submit_project":
    case "edit_own_profile":
    case "help:request":
      return ok();

    case "view_roster":
      // Roster = membership names + levels. A department head sees their own
      // department; a vertical lead sees their own vertical. No other member
      // gets the whole chapter by default.
      if (role === "vertical_lead") return ownVertical ? ok() : no();
      if (isOwnDeptLead) return ok("own_only");
      return no();

    case "view_directory":
      if (role === "vertical_lead") return ok();
      if (isAnyDeptLead) return ok("limited");
      return no();

    case "draft_announcement":
      if (role === "vertical_lead") {
        if (!scope.departmentId && !scope.vertical) return ok();
        return ownVertical ? ok() : no();
      }
      if (isOwnDeptLead) return ok("own_feed");
      return no();

    case "publish_announcement":
      if (role === "admin") return ok();
      return no();

    case "post_announcement":
      if (role === "vertical_lead") return ok();
      if (isOwnDeptLead) return ok("own_feed");
      return no();

    case "edit_static":
      return no();

    case "manage_faq":
      if (role === "vertical_lead") return no("suggest_only");
      return no();

    case "suspend_member":
      if (role === "vertical_lead" && ownVertical) return { ok: true, note: "needs_signoff" };
      return no();

    case "export_reports":
      if (role === "vertical_lead") return ok();
      if (isOwnDeptLead) return ok("own_only");
      return no();

    case "manage_advisor":
      if (role === "vertical_lead" && ownVertical) return no("view_only");
      return no();

    case "verify_evidence":
      return no();

    // --- Lead Tools ---

    case "view_lead_tools":
    case "view_assets":
      if (r >= RANK.dept_lead) return ok();
      if (role === "core") return ok("view_only");
      return no();

    case "manage_mou":
      if (isSponsorshipLead || isPRLead) return ok();
      if (role === "vertical_lead" && ownVertical) return ok();
      if (role === "admin") return ok();
      return no();

    case "manage_sponsorship_leads":
      if (isSponsorshipLead) return ok();
      if (role === "vertical_lead" && ownVertical) return ok();
      if (role === "admin") return ok();
      return no();

    case "manage_outreach_leads":
      if (isPRLead) return ok();
      if (role === "vertical_lead" && ownVertical) return ok();
      if (role === "admin") return ok();
      return no();

    case "manage_promotional_campaigns":
      if (isPublicityLead) return ok();
      if (isSMMLead) return ok("limited");
      if (role === "vertical_lead" && ownVertical) return ok();
      if (role === "admin") return ok();
      return no();

    case "manage_social_content":
      if (isSMMLead) return ok();
      if (isDesignLead) return ok("limited");
      if (role === "vertical_lead" && ownVertical) return ok();
      if (role === "admin") return ok();
      return no();

    case "manage_event_ops":
      if (isManagementLead) return ok();
      if (role === "vertical_lead" && ownVertical) return ok();
      if (role === "admin") return ok();
      return no();

    case "manage_assets":
      if (isDesignLead || isSMMLead) return ok();
      if (role === "vertical_lead" && ownVertical) return ok();
      if (role === "admin") return ok();
      return no();

    case "manage_contests":
      if (isTechnicalDeptLead) return ok();
      if (role === "vertical_lead" && ownVertical) return ok();
      if (role === "admin") return ok();
      return no();

    case "manage_handover":
      if (r >= RANK.dept_lead) return ok();
      return no();

    case "manage_leads":
      return no("deprecated: use manage_sponsorship_leads or manage_outreach_leads");

    default:
      return no();
  }
}

/** Legacy coarse gate: every existing `role === "admin"` boundary keeps
 *  working unchanged. New code should use can() with a real action. */
export function isAdmin(user) {
  return rank(effectiveRole(user)) >= RANK.admin;
}

/** Numeric level for upward-only role sync (never demote via sync). */
export function roleRank(role) {
  return rank(role);
}