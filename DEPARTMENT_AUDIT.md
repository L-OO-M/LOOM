# LOOM — Department Responsibility and Interface Audit

**Audit date:** 2026-11-21

**Scope:** the shipped thirteen departments, their declared responsibilities, authorization, backend workflows, and user-facing operating surfaces

**Verdict:** the shared department operating system is implemented for all thirteen departments; several specialist department products are still missing and are tracked below.

## 1. What was verified

This is a source audit of the current repository, not a restatement of an older architecture document. The checks used:

- `lib/department-catalog.js` for the canonical 6 technical + 7 non-technical departments and their ownership statements;
- `lib/permissions.js` for capability and scope decisions;
- `lib/department-workspace.js` and `/lead/departments/[slug]` for the shared interface;
- route handlers under `app/api/departments`, `events`, `lead`, `finance`, `reports`, `approvals`, and `workflows` for real write paths;
- migrations 088–097 for department alignment, work evidence, scoped grants, lifecycle state, approvals, and handoffs;
- existing unit/E2E coverage and targeted authorization, workflow, and leadership regressions.

An item counts as **complete** only when all three layers exist:

1. a server-enforced permission and tenant boundary;
2. a real persistence/workflow path with validation and audit history;
3. an interface through which the intended department can use it.

A permission name or a database column by itself does not count as a finished product.

## 2. Shared operating system — shipped

Every shipped department has a real workspace at `/lead/departments/[slug]`. It is one shared engine with department configuration, not thirteen duplicated applications. Depending on capability, it exposes:

- live Head/Co-Head roster and term information;
- member roster management (General/Core only; leadership appointments remain an admin transaction);
- department tasks with assignment, deadline, evidence, independent review, return, and audit history;
- department events and event operations;
- monthly reports and contribution records;
- assets, budget context, agreements, and leadership history where authorized;
- honest empty states backed by tenant-scoped rows, never sample statistics or fake activity.

Authority is not inferred from a title alone. Active vertical grants, live Head memberships, server-derived tenant identity, record ownership, and separation-of-duty checks constrain each operation. General/Core or expired memberships do not widen a lead's workspace or vertical.

## 3. Department-by-department result

| Department | Responsibilities with working product support | Verified gap | Result |
|---|---|---|---|
| **AI / ML** | Learning track, events/workshops, tasks/evidence, projects/GitHub proof, reports/contributions; workshop handoffs require repository + model write-up with optional dataset/demo. | No blocking gap in the stated operating baseline. A future experiment registry would be an enhancement, not a missing core responsibility. | **Usable** |
| **Web Development** | Learning track, project/team/milestone flow, GitHub verification, events, tasks, reports; handoffs require repository + deployed URL. | Shared infrastructure requests remain task-based by design; production credentials are deliberately outside department authority. | **Usable** |
| **Cybersecurity** | Security learning, debug challenges, contests, projects, events, tasks, evidence/reports; handoffs require finding summary + remediation notes. | No production-testing privilege is implied or missing. | **Usable** |
| **DSA & Problem Solving** | Dedicated weekly practice room, LeetCode connection/sync, seven-question week authoring, corrections, contests, verified solve ranking, events/tasks/reports. | No material responsibility gap found. | **Strong** |
| **Blockchain** | Learning track, public-repository projects, events/workshops, tasks/evidence, reports/contributions; handoffs require repository + contract/deployment details. | Test-network policy is content/governance rather than a separate product. | **Usable** |
| **Embedded & Hardware** | Learning/project/event/task/report surfaces and hardware deliverables (schematic + bring-up log) exist. | No inventory, reservation, custody, consumable stock, or maintenance system. [#84](https://github.com/L-OO-M/LOOM/issues/84) | **Partial** |
| **Design** | Versioned private asset library, signed downloads, department asset ownership, tasks/events/reports, and workshop design handoff (source + preview). | Migration lifecycle fields are not yet operable as submit/review/approve/archive UI and API. [#80](https://github.com/L-OO-M/LOOM/issues/80) | **Partial** |
| **Documentation** | Department/monthly reports with revision history, event context, generic document assets, MoU document versions, and pre/post workshop handoffs. | No authoritative template/review/issue/supersede/archive lifecycle for official records and SOPs. [#81](https://github.com/L-OO-M/LOOM/issues/81) | **Partial** |
| **SMM & Content Creation** | Photo/video asset storage, tasks, event context, announcement drafts, and workshop content handoff (content plan + caption draft). | No content calendar, platform publishing queue, usage-rights workflow, or performance record. [#83](https://github.com/L-OO-M/LOOM/issues/83) | **Partial** |
| **Publicity** | Scoped announcements, events, tasks, reports, and workshop promotion handoff (channel plan + schedule). | No campaign plan, distribution checklist, registration target, reach, or response tracking product. [#78](https://github.com/L-OO-M/LOOM/issues/78) | **Partial** |
| **Sponsorship** | Finance sponsorship ledger, scoped budget visibility, MoUs and versioned documents, renewal tasks, department work/reports, and distinct sponsorship capability. | The ledger is not a sponsor CRM: prospecting, interactions, packages, fulfilment, proof, and next actions are missing. [#79](https://github.com/L-OO-M/LOOM/issues/79) | **Partial** |
| **Management** | Dedicated event-operations board, owners/priorities/deadlines/blockers, event lifecycle, volunteer slots/roster, planner, budget context, reports, and workshop logistics handoff. | Rich run-sheet/resource views could improve the product, but current real task/volunteer/planner surfaces cover the stated baseline without fake data. | **Usable** |
| **Public Relations** | MoU coordination, agreement documents/renewals, events/tasks/reports, leadership directory, and a distinct outreach capability. | The leadership directory is not an institutional-contact CRM; correspondence, relationship history, and partnership stages are missing. Shared engine with separate PR/Sponsorship pipelines: [#79](https://github.com/L-OO-M/LOOM/issues/79). | **Partial** |

## 4. Cross-department handoffs

The implemented `society_workshop` pipeline now has explicit owners and deliverables:

1. initiating technical department — proposal/technical material;
2. Documentation — official brief;
3. Design — creative source and preview;
4. SMM — content plan and caption;
5. Publicity — channels and distribution schedule;
6. Management — venue/run sheet/volunteer plan;
7. Documentation — final event report and archive references.

The backend is not a loose checklist. It provides a handoff FSM, dependency ordering, tenant-bound foreign keys, deliverable validation, independent review, self-approval prevention, and optimistic status updates. Only `society_workshop` is creatable; reserved types such as hackathon do not silently reuse the wrong pipeline.

There is not yet a workflow inbox/timeline/form interface. That is a substantial product task, not a safe last-minute form, and is tracked in [#82](https://github.com/L-OO-M/LOOM/issues/82).

## 5. Capability-to-product truth table

| Capability | Permission exists | Backend/persistence | Suitable interface | Conclusion |
|---|---:|---:|---:|---|
| `manage_department_tasks` / `verify_department_work` | Yes | Yes | Yes | Shipped |
| `manage_event_tasks` | Yes | Yes (`event_ops_tasks`) | Yes (`/lead/event-ops`) | Shipped |
| `create_event_documentation` | Yes | Partial (reports/assets/handoffs) | Partial | #81 |
| `manage_assets` | Yes | Partial lifecycle | Upload/version UI only | #80 |
| `manage_social_content` | Yes | No dedicated model | No dedicated surface | #83 |
| `manage_promotional_campaigns` | Yes | No dedicated model | No dedicated surface | #78 |
| `manage_sponsorship_leads` | Yes | Finance ledger + MoUs only | No CRM | #79 |
| `manage_outreach_leads` | Yes | MoUs/directory only | No CRM | #79 |
| workshop workflow handoffs | Yes, through scoped task authority | Yes | No | #82 |
| hardware inventory/custody | No dedicated capability | No | No | #84 |

## 6. Small gaps fixed during this audit

These were root-cause authorization/lifecycle defects and were fixed in the current architecture change rather than deferred:

- only live `dept_lead` memberships can widen department workspace or vertical ownership;
- lead pages and APIs retain tenant identity, scoped grants, and term expiry when evaluating `can()`;
- event-operations and announcement management reads are narrowed to active authority;
- the roster endpoint can no longer appoint, demote, or remove a Head seat; every leadership change goes through the atomic admin role transaction;
- scoped grant synchronization preserves unrelated assignments by default and makes full revocation explicit for global role replacement/handover;
- workflow listing is authority-scoped, unsupported templates fail closed, linked records are tenant-validated, and handoff writes use an explicit FSM plus optimistic concurrency;
- audit history is append-only to the application role; retention is available only through the guarded `loom_private.prune_audit_logs_before` function.

Regression coverage lives in `tests/department-workspace.test.js`, `tests/governance-scope.test.js`, `tests/department-work-routes.test.js`, `tests/scoped-grants.test.js`, `tests/department-handoffs.test.js`, `tests/workflow-routes.test.js`, and `tests/ams-security.test.js`.

## 7. Deferred issue register

| Issue | Department/product | Priority |
|---|---|---|
| [#78](https://github.com/L-OO-M/LOOM/issues/78) | Publicity campaign planning/distribution/outcomes | P1 |
| [#79](https://github.com/L-OO-M/LOOM/issues/79) | Shared partner directory with separated Sponsorship/PR pipelines | P1 |
| [#80](https://github.com/L-OO-M/LOOM/issues/80) | Design/media asset approval lifecycle | P1 |
| [#81](https://github.com/L-OO-M/LOOM/issues/81) | Documentation official-document lifecycle | P1 |
| [#82](https://github.com/L-OO-M/LOOM/issues/82) | Cross-department workflow inbox and handoff UI | P1 |
| [#83](https://github.com/L-OO-M/LOOM/issues/83) | SMM content calendar/publishing/performance | P1 |
| [#84](https://github.com/L-OO-M/LOOM/issues/84) | Embedded equipment inventory/reservations/custody | P2 |

## 8. Final answer to the audit question

**No, every specialist responsibility does not yet have a complete dedicated interface.**

**Yes, all thirteen departments exist and have a secure, real-data shared workspace for their everyday roster, task, event, proof, report, and leadership operations.**

The incomplete parts are now named precisely and tracked as implementation tickets. Existing assets, announcements, finance, MoUs, event operations, reports, DSA practice, projects, and department work should be reused by those tickets rather than rebuilt as isolated department apps.

Remote migrations 096/097 and a real restore drill are operational steps, not silently completed by this source audit. Restore verification remains tracked in [#53](https://github.com/L-OO-M/LOOM/issues/53).
