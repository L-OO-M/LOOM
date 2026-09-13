import { createServerSupabase } from "@/lib/supabase/server";
import { getSql, queryTenant } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { AdminDashboard } from "@/components/AdminDashboard";

export default async function AdminPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const sql = getSql();
  const tenant = await queryTenant("demo-college");

  const activeCount = await sql`SELECT COUNT(*)::int AS c FROM profiles`;
  const eventCount = await sql`
    SELECT COUNT(*)::int AS c FROM github_events
    WHERE received_at > NOW() - INTERVAL '1 day'
  `;
  const flags = await sql`
    SELECT * FROM feature_flags WHERE tenant_id = ${tenant.id}
  `;
  const auditEntries = await sql`
    SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 8
  `;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <AdminDashboard
        activeCount={activeCount[0]?.c ?? 0}
        eventCount={eventCount[0]?.c ?? 0}
        flags={flags}
        auditEntries={auditEntries}
      />
    </AppShell>
  );
}