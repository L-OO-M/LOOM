// Provision the media-storage bucket and seed the default asset categories.
//
// Run once per environment after `node load/migrate.js`:
//     node load/setup-storage.js
//
// Idempotent: the bucket is only created if missing, and categories are seeded
// with ON CONFLICT DO NOTHING, so re-running is safe. Reads .env.local through
// load/env-local.js like every other script here (secrets never hardcoded).
import postgres from "postgres";
import { databaseUrl, targetDatabaseUrl } from "./env-local.js";

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "loom-files";

const DEFAULT_CATEGORIES = [
  { slug: "logos", name: "Logos", sort_order: 10 },
  { slug: "signatures", name: "Signatures", sort_order: 20 },
  { slug: "templates", name: "Templates", sort_order: 30 },
  { slug: "mou-templates", name: "MoU Templates", sort_order: 40 },
  { slug: "banners", name: "Banners", sort_order: 50 },
  { slug: "posters", name: "Posters", sort_order: 60 },
  { slug: "presentations", name: "Presentations", sort_order: 70 },
  { slug: "documents", name: "Documents", sort_order: 80 }
];

async function ensureBucket(supabase) {
  const { data: existing } = await supabase.storage.getBucket(BUCKET);
  if (existing) {
    console.log(`bucket: ${BUCKET} already exists`);
    return;
  }
  const { error } = await supabase.storage.createBucket(BUCKET, { public: false });
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`[setup-storage] could not create bucket: ${error.message}`);
  }
  console.log(`bucket: created ${BUCKET} (private)`);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (checked env + .env.local)."
    );
    process.exit(1);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  await ensureBucket(supabase);

  const sql = postgres(databaseUrl(), { max: 1, prepare: false });
  try {
    const tenants = await sql`SELECT id, slug FROM public.tenants`;
    let inserted = 0;
    for (const t of tenants) {
      for (const c of DEFAULT_CATEGORIES) {
        const rows = await sql`
          INSERT INTO public.asset_categories (tenant_id, name, slug, sort_order)
          VALUES (${t.id}, ${c.name}, ${c.slug}, ${c.sort_order})
          ON CONFLICT (tenant_id, slug) DO NOTHING
          RETURNING id`;
        inserted += rows.length;
      }
    }
    console.log(`categories: ${DEFAULT_CATEGORIES.length} per tenant across ${tenants.length} tenant(s), ${inserted} new row(s)`);
  } finally {
    await sql.end();
  }

  // --target mirrors migrate.js for the region-migration tooling.
  if (process.argv.includes("--target")) targetDatabaseUrl();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
