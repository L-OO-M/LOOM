# LOOM — Department Architecture & RBAC Audit

**Date:** 2025  
**Status:** Pre-implementation audit

---

## 1. Current Department Structure

### 1.1 Seeded Departments (from `load/seed-departments.js`)

| # | Name | Slug | Vertical | Description |
|---|------|------|----------|-------------|
| 1 | AI / ML | `ai_ml` | technical | Machine learning fundamentals, paper reading, dataset contests, applied projects |
| 2 | Web Development | `web` | technical | Modern web fundamentals, frameworks, Git workflow, deployment |
| 3 | Cybersecurity | `cybersecurity` | technical | Ethical hacking, CTFs, cryptography, secure coding |
| 4 | DSA & Problem Solving | `dsa` | technical | Weekly problem-solving, contests, interview prep |
| 5 | Blockchain | `blockchain` | technical | Distributed ledgers, smart contracts, Web3 mini-projects |
| 6 | Embedded & Hardware | `embedded` | technical | Microcontrollers, Arduino, Raspberry Pi, sensors |
| 7 | Backend & APIs | `backend` | technical | Databases, service design, auth, queues |
| 8 | DevOps & Infra | `devops` | technical | Linux, containers, CI/CD, observability |
| 9 | PR & Outreach | `pr_outreach` | non_technical | Socials, campus presence, event promotions, external communications |
| 10 | Design | `design` | non_technical | Visual identity, posters, merch, slide systems, media assets |
| 11 | Sponsorship & EVM | `sponsorship_evm` | non_technical | Sponsor pipeline, budget coordination, event logistics |

**Total: 11 departments (8 technical, 3 non-technical)**

### 1.2 Domain Vocabulary (from `lib/domains.js`)

```javascript
PRIMARY_DOMAINS = ["ai_ml", "web", "cybersecurity", "dsa", "blockchain", "embedded"]
SHARED_DOMAINS = ["backend", "devops"]
DOMAIN_ORDER = [...PRIMARY_DOMAINS, ...SHARED_DOMAINS]
```

**Note:** `backend` and `devops` are SHARED domains (support tracks), not PRIMARY. They don't have independent roadmaps.

---

## 2. Current Organizational Hierarchy

### 2.1 Role Levels (from `lib/permissions.js`)

```
student (0) < core (1) < dept_lead (2) < vertical_lead (3) < admin (4) < platform_admin (5)
```

### 2.2 Department Leadership Model

**Schema (from `014_org_model.sql`):**
- `departments.head_user_id` — first head
- `departments.co_head_user_id` — second head (co-equal)
- `department_memberships.level = 'dept_lead'` — authoritative permission source

**Assignment flow (from `app/api/admin/students/route.js`):**
1. Admin assigns `dept_lead` role with `departmentId`
2. Transaction creates `department_memberships` row with `level = 'dept_lead'`
3. Updates `departments.head_user_id` (if null) then `co_head_user_id`
4. Syncs `profiles.role = 'dept_lead'` with term dates
5. Records in `leadership_terms` history table

**Key invariant:** Both heads get identical `dept_lead` membership level → identical permissions.

---

## 3. Current Permission Matrix (from `lib/permissions.js`)

### 3.1 Actions Defined (19 total)

| Action | Dept Lead | Vertical Lead | Admin |
|--------|-----------|---------------|-------|
| `manage_users` | ❌ | ❌ | ✅ |
| `edit_dept_content` | ✅ (own dept) | ✅ (own vertical) | ✅ |
| `post_event_society` | ⚠️ needs_approval | ✅ | ✅ |
| `post_workshop_dept` | ✅ (own dept) | ✅ (own vertical) | ✅ |
| `approve_budget` | ❌ | ⚠️ recommend_only | ✅ |
| `view_finance` | ❌ | ✅ (own vertical) | ✅ |
| `assign_mentor` | ✅ (own dept) | ✅ (own vertical) | ✅ |
| `log_contribution` | ✅ (own dept) | ✅ (own vertical) | ✅ |
| `view_roster` | ✅ (own dept) | ✅ (own vertical) | ✅ |
| `view_directory` | ⚠️ limited | ✅ | ✅ |
| `post_announcement` | ⚠️ own_feed | ✅ (society-wide) | ✅ |
| `export_reports` | ✅ (own dept) | ✅ (own vertical) | ✅ |
| `manage_mou` | ✅ | ✅ | ✅ |
| `manage_leads` | ✅ | ✅ | ✅ |
| `manage_event_ops` | ✅ | ✅ | ✅ |
| `manage_assets` | ✅ | ✅ | ✅ |
| `manage_contests` | ✅ | ✅ | ✅ |
| `manage_handover` | ✅ | ✅ | ✅ |
| `verify_evidence` | ❌ | ❌ | ✅ |

### 3.2 Critical Gaps Identified

1. **`manage_leads` is overbroad** — conflates sponsorship leads, PR leads, and general contacts
2. **`manage_event_ops` is universal** — every dept head gets full event ops; should be Management-owned with task-level delegation
3. **`view_finance` is binary** — no distinction between event budgets, sponsorship commitments, and actual financial admin
4. **`post_announcement` lacks approval workflow** — vertical leads publish society-wide directly
5. **No department-specific permissions** — all dept heads get identical capabilities regardless of function
6. **No resource-level scoping** — permissions are department-scoped, not task/event-scoped

---

## 4. Required Department Structure (Per Specification)

### 4.1 Technical Vertical (6 departments)

| # | Name | Slug | Vertical | Maps to Domain |
|---|------|------|----------|----------------|
| 1 | AI / ML | `ai_ml` | technical | `ai_ml` ✅ |
| 2 | Web Development | `web` | technical | `web` ✅ |
| 3 | Cybersecurity | `cybersecurity` | technical | `cybersecurity` ✅ |
| 4 | DSA & Problem Solving | `dsa` | technical | `dsa` ✅ |
| 5 | Blockchain | `blockchain` | technical | `blockchain` ✅ |
| 6 | Embedded & Hardware | `embedded` | technical | `embedded` ✅ |

**Changes from current:**
- ❌ Remove `backend` (shared domain, not independent department)
- ❌ Remove `devops` (shared domain, not independent department)

### 4.2 Non-Technical Vertical (7 departments)

| # | Name | Slug | Vertical | Replaces |
|---|------|------|----------|----------|
| 1 | Design | `design` | non_technical | `design` ✅ (existing) |
| 2 | Documentation | `documentation` | non_technical | **NEW** |
| 3 | SMM & Content Creation | `smm_content` | non_technical | **NEW** (split from PR & Outreach) |
| 4 | Publicity | `publicity` | non_technical | **NEW** (split from PR & Outreach) |
| 5 | Sponsorship | `sponsorship` | non_technical | `sponsorship_evm` (rename + narrow) |
| 6 | Management | `management` | non_technical | **NEW** |
| 7 | Public Relations | `public_relations` | non_technical | **NEW** (split from PR & Outreach) |

**Changes from current:**
- ❌ Remove `pr_outreach` → split into 3: SMM, Publicity, PR
- ✏️ Rename `sponsorship_evm` → `sponsorship` (drop EVM; event ops moves to Management)
- ➕ Add `documentation`, `management`

**Total: 13 departments (6 technical, 7 non-technical)**

---

## 5. Proposed Permission Matrix

### 5.1 Design

| Capability | Access | Notes |
|------------|--------|-------|
| Manage department assets (designs, templates, brand) | **Full** | Own department only |
| Create documents (design briefs, specs) | **Limited** | Read event info for context |
| Manage social content | **None** | SMM owns this |
| Create campaigns | **Limited** | Design assets for campaigns |
| Manage external leads | **None** | PR owns this |
| Manage sponsorship leads | **None** | Sponsorship owns this |
| Event operations | **None** | Management owns this |
| View event reports | **Limited** | For design deadlines |
| View event budgets | **None** | — |
| Society-wide announcements | **None** | — |

### 5.2 Documentation

| Capability | Access | Notes |
|------------|--------|-------|
| Manage department | **Full** | Own department |
| Upload department assets | **Limited** | Reference materials only |
| Create documents | **Full** | Event docs, reports, minutes, archives |
| Manage social content | **None** | — |
| Create campaigns | **None** | — |
| Manage external leads | **None** | — |
| Manage sponsorship leads | **None** | — |
| Event operations | **Limited** | Read-only for reporting |
| View event reports | **Full** | Authoritative for event records |
| View event budgets | **Limited** | When authorized for budget docs |
| Society-wide announcements | **None** | — |

### 5.3 SMM & Content Creation

| Capability | Access | Notes |
|------------|--------|-------|
| Manage department | **Full** | Own department |
| Upload department assets | **Full** | Videos, photos, content library |
| Create documents | **Limited** | Content calendars, briefs |
| Manage social content | **Full** | Content calendars, publishing workflows |
| Create campaigns | **Full** | Social campaigns |
| Manage external leads | **None** | — |
| Manage sponsorship leads | **None** | — |
| Event operations | **Limited** | Content for assigned events |
| View event reports | **Limited** | For content planning |
| View event budgets | **None** | — |
| Society-wide announcements | **Limited** | Draft only, approval required |

### 5.4 Publicity

| Capability | Access | Notes |
|------------|--------|-------|
| Manage department | **Full** | Own department |
| Upload department assets | **Limited** | Promotional materials |
| Create documents | **Limited** | Campaign plans, promo schedules |
| Manage social content | **Limited** | Distribution coordination |
| Create campaigns | **Full** | Promotional campaigns |
| Manage external leads | **Limited** | Media contacts, campus channels |
| Manage sponsorship leads | **None** | — |
| Event operations | **Limited** | Promo tasks for assigned events |
| View event reports | **Limited** | For campaign effectiveness |
| View event budgets | **None** | — |
| Society-wide announcements | **Limited** | Draft only, approval required |

### 5.5 Sponsorship

| Capability | Access | Notes |
|------------|--------|-------|
| Manage department | **Full** | Own department |
| Upload department assets | **Limited** | Proposals, agreements |
| Create documents | **Limited** | Sponsorship proposals, MOUs |
| Manage social content | **None** | — |
| Create campaigns | **Limited** | Sponsor outreach campaigns |
| Manage external leads | **Full** | Sponsor CRM, pipeline |
| Manage sponsorship leads | **Full** | Authoritative for sponsorship |
| Event operations | **Limited** | Sponsor deliverables for events |
| View event reports | **Limited** | For sponsor reporting |
| View event budgets | **Limited** | Sponsor commitments only |
| Society-wide announcements | **None** | — |

### 5.6 Management

| Capability | Access | Notes |
|------------|--------|-------|
| Manage department | **Full** | Own department |
| Upload department assets | **Limited** | Event ops docs, checklists |
| Create documents | **Limited** | Execution plans, task specs |
| Manage social content | **None** | — |
| Create campaigns | **Limited** | Internal coordination |
| Manage external leads | **None** | — |
| Manage sponsorship leads | **None** | — |
| Event operations | **Full** | Owns event execution, task assignment |
| View event reports | **Full** | For operational oversight |
| View event budgets | **Limited** | Operational budget tracking |
| Society-wide announcements | **Limited** | Draft only, approval required |

### 5.7 Public Relations

| Capability | Access | Notes |
|------------|--------|-------|
| Manage department | **Full** | Own department |
| Upload department assets | **Limited** | Outreach materials |
| Create documents | **Limited** | Collaboration proposals, outreach records |
| Manage social content | **None** | — |
| Create campaigns | **Limited** | Outreach campaigns |
| Manage external leads | **Full** | Institutional contacts, partnerships |
| Manage sponsorship leads | **Limited** | Partner overlap only |
| Event operations | **Limited** | External guest coordination |
| View event reports | **Limited** | For partnership reporting |
| View event budgets | **None** | — |
| Society-wide announcements | **None** | — |

### 5.8 Technical Departments (All 6)

| Capability | Access | Notes |
|------------|--------|-------|
| Manage department | **Full** | Own department |
| Manage projects/workshops | **Full** | Own domain |
| Technical resources | **Full** | Datasets, labs, infra requests |
| Production credentials | **None** | Separate authorization |
| Infrastructure secrets | **None** | Separate authorization |
| Deployment privileges | **None** | Separate authorization |

---

## 6. New Permissions Required

| New Permission | Scope | Replaces/Refines |
|----------------|-------|------------------|
| `manage_sponsorship_leads` | Sponsorship dept only | Part of `manage_leads` |
| `manage_outreach_leads` | PR dept only | Part of `manage_leads` |
| `manage_promotional_campaigns` | Publicity dept only | Part of `manage_event_ops` |
| `manage_social_content` | SMM dept only | Part of `manage_event_ops` |
| `create_event_documentation` | Documentation dept only | Part of `edit_dept_content` |
| `manage_event_tasks` | Management + assigned depts | Part of `manage_event_ops` |
| `view_event_budget` | Sponsorship, Management, Documentation (limited) | Part of `view_finance` |
| `approve_event_budget` | Admin only | Part of `approve_budget` |
| `draft_society_announcement` | All leads (submit for approval) | Part of `post_announcement` |
| `publish_society_announcement` | Admin only | Part of `post_announcement` |
| `assign_event_task` | Management → other depts | New |
| `view_assigned_event_tasks` | All depts (own tasks) | New |

---

## 7. Migration Strategy

### 7.1 Department Migration

| Current Slug | New Slug | Action |
|--------------|----------|--------|
| `ai_ml` | `ai_ml` | Keep |
| `web` | `web` | Keep |
| `cybersecurity` | `cybersecurity` | Keep |
| `dsa` | `dsa` | Keep |
| `blockchain` | `blockchain` | Keep |
| `embedded` | `embedded` | Keep |
| `backend` | — | **Remove** (shared domain) |
| `devops` | — | **Remove** (shared domain) |
| `pr_outreach` | — | **Remove** (split) |
| `design` | `design` | Keep |
| `sponsorship_evm` | `sponsorship` | **Rename** |

**New departments to add:**
- `documentation`
- `smm_content`
- `publicity`
- `management`
- `public_relations`

### 7.2 Membership Migration

Existing memberships in removed departments (`backend`, `devops`, `pr_outreach`):
- Migrate to `web` (for backend/devops members)
- Migrate to `publicity` or `smm_content` or `public_relations` based on member's contribution history
- Preserve `level` and `joined_at`

### 7.3 Permission Migration

No direct permission migration — permissions are computed dynamically via `can()` function. New permissions will be added to the `ACTIONS` array and `can()` switch statement.

---

## 8. Implementation Phases

### Phase 1: Department Structure (Critical)
- [ ] Create migration for new departments
- [ ] Update `load/seed-departments.js`
- [ ] Create data migration for removed departments
- [ ] Update `lib/domains.js` (remove backend/devops from PRIMARY_DOMAINS)

### Phase 2: Permission System (Critical)
- [ ] Add new permissions to `ACTIONS` array
- [ ] Implement department-specific permission logic in `can()`
- [ ] Add resource-level scoping helpers

### Phase 3: API & Backend (Critical)
- [ ] Update event creation to use new permissions
- [ ] Update announcement workflow (draft → approve → publish)
- [ ] Add task assignment API for Management → other depts

### Phase 4: Frontend (High)
- [ ] Update lead console for department-specific capabilities
- [ ] Update admin departments page
- [ ] Add department-specific UI in lead sections

### Phase 5: Testing (Critical)
- [ ] Add tests for new permission matrix
- [ ] Test cross-department access restrictions
- [ ] Test approval workflows
- [ ] Test migration idempotency

---

## 9. Files Requiring Changes

### Core Files
1. `load/seed-departments.js` — department definitions
2. `lib/permissions.js` — permission matrix
3. `lib/domains.js` — domain vocabulary
4. `load/migrations/014_org_model.sql` — schema (if needed)

### Migration Files (new)
5. `load/migrations/XXX_department_restructure.sql` — department changes
6. `load/migrations/XXX_permission_actions.sql` — if new permission columns needed

### API Routes
7. `app/api/departments/[id]/members/[userId]/route.js` — membership grants
8. `app/api/events/route.js` — event creation permissions
9. `app/api/announcements/route.js` — announcement workflow
10. `app/api/events/[id]/approve/route.js` — event approval

### Frontend
11. `app/(app)/lead/_components/LeadConsole.jsx` — department-specific views
12. `components/lead/LeadActions.jsx` — WorkshopForm, etc.
13. `app/(app)/admin/departments/page.jsx` — admin department management
14. `app/(app)/admin/departments/_components/DepartmentCard.jsx`

### Tests
15. `tests/permissions.test.js` — new permission matrix tests
16. `tests/role-promotion.test.js` — updated role tests
17. New test files for department-specific permissions

---

## 10. Open Questions

1. **Dual-head approval for sensitive actions?** — Should removing a head, transferring ownership require both heads' approval?

2. **Vertical leads** — Keep as optional layer? Current code has them but they're not mandatory for the new structure.

3. **Backend/DevOps as shared functions** — Should they remain as "shared domains" in `lib/domains.js` but not departments?

4. **Historical data** — How to handle events/documents tagged with `backend`/`devops`/`pr_outreach` departments?

5. **Term limits** — Current 1-year default for rotating roles. Keep for new departments?

---

## 11. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing memberships during migration | High | High | Idempotent migration, preserve history, dry-run first |
| Permission regressions | Medium | High | Comprehensive test suite, phased rollout |
| Frontend permission mismatches | Medium | Medium | Centralized `can()` usage, remove inline role checks |
| Admin workflow disruption | Low | High | Preserve admin department management UI |
| Cross-tenant data leaks | Low | Critical | All queries already tenant-scoped; verify new queries |

---

*End of Audit Document*