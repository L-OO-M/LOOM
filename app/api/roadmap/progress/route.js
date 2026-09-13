import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";

const progressSchema = z.object({
  nodeId: z.string().min(1),
  status: z.enum(["active", "completed"])
});

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;

  let body;
  try {
    body = progressSchema.parse(await request.json());
  } catch (error) {
    return validationError(error);
  }

  const [node] = await sql`
    SELECT * FROM roadmap_nodes WHERE id = ${body.nodeId} LIMIT 1
  `;
  if (!node) return fail("ROADMAP_NODE_NOT_FOUND", "Roadmap node was not found", 404);

  const completedAt = body.status === "completed" ? new Date().toISOString() : null;
  const [row] = await sql`
    INSERT INTO student_roadmap_progress (student_id, node_id, status, completed_at)
    VALUES (${user.id}, ${body.nodeId}, ${body.status}, ${completedAt})
    ON CONFLICT (student_id, node_id) DO UPDATE SET status = EXCLUDED.status, completed_at = EXCLUDED.completed_at, updated_at = NOW()
    RETURNING *
  `;

  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id,
    action: body.status === "completed" ? "completed_roadmap_node" : "started_roadmap_node",
    resource: "roadmap_node", resourceId: body.nodeId,
    after: { nodeId: body.nodeId, status: body.status }
  });

  if (body.status === "completed") {
    await notify({
      sql, tenantId: tenant?.id, userId: user.id,
      type: "roadmap", title: `Completed: ${node.title}`,
      body: "Roadmap progress updated.", link: "/student/roadmap"
    });
  }

  return ok({ progress: row, studentId: user.id, role: profile.role });
}
