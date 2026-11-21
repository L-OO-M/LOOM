import { createHash } from "node:crypto";

// Aggregate every proposal by the same person against the same budget scope on
// the same UTC day. Notes are deliberately excluded: changing punctuation or
// wording must not evade a dual-approval threshold.
export function expenseExpenditureGroupKey({
  tenantId,
  actorId,
  departmentId = null,
  headId = null,
  date = new Date()
}) {
  const day = date.toISOString().slice(0, 10);
  return createHash("sha256")
    .update([tenantId, actorId, departmentId || "society", headId || "unheaded", day].join("|"))
    .digest("hex");
}
