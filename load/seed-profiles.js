// Usage: node load/seed-profiles.js <user-id>
// Get the user ID from Supabase Auth dashboard after registering
import postgres from "postgres";

const DATABASE_URL = "postgresql://postgres.gbkpocjtcnozihvacmtg:LOOMLOBBY1234@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres";
const userId = process.argv[2];

if (!userId) {
  console.error("Usage: node load/seed-profiles.js <user-id>");
  console.error("Get the user ID from your Supabase Auth dashboard: https://supabase.com/dashboard/project/gbkpocjtcnozihvacmtg/auth/users");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1 });

try {
  await sql`
    INSERT INTO profiles (user_id, name, role, primary_domain, year)
    VALUES (${userId}, 'Admin User', 'admin', 'web', 3)
    ON CONFLICT (user_id) DO UPDATE SET role = 'admin'
  `;
  console.log("Profile created with admin role");

  await sql`
    INSERT INTO platform_admins (user_id)
    VALUES (${userId})
    ON CONFLICT (user_id) DO NOTHING
  `;
  console.log("Platform admin entry created");
} catch (e) {
  console.error("Seed failed:", e.message);
} finally {
  await sql.end();
}