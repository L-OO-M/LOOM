import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const DATABASE_URL = "postgresql://postgres.gbkpocjtcnozihvacmtg:LOOMLOBBY1234@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres";

const sql = postgres(DATABASE_URL, { max: 1 });
const db = drizzle(sql);

const tables = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ORDER BY table_name
`;

console.log("Tables created:", tables.map(t => t.table_name).join(", "));
await sql.end();