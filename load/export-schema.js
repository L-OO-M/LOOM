// Generates load/migrations/000_base_schema.sql from a live database.
//
// WHY THIS EXISTS
// The original base tables (tenants, profiles, roadmap_nodes, resources,
// contests, mentor_sessions, ...) were created directly in the Supabase SQL
// editor and never captured in load/migrations/. Migration 001 only does
// `ALTER TABLE public.profiles ADD COLUMN ...`, so a fresh project cannot be
// built from migrations alone. This exporter captures that base state once so
// any new database can be rebuilt deterministically.
//
// Everything it emits is idempotent (IF NOT EXISTS / guarded DO blocks), so the
// tracked migrations 001..N continue to apply cleanly on top of it.
//
// Usage: node --import ./load/env-local.js load/export-schema.js
//   (DATABASE_URL selects the source; output path is the migration itself)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { databaseUrl } from "./env-local.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "migrations", "000_base_schema.sql");
const ONLY_PUBLIC = true;

// Tables that migration 012_drop_dead_tables.sql removes. They are absent from
// a live database, so a straight replay of 001..N would fail when an earlier
// migration references them:
//   001 -> ALTER/INDEX on public.users
//   006 -> CREATE INDEX on public.leaderboard_snapshots(scope, period)
//   012 -> DROP TABLE IF EXISTS (all four)
// We therefore recreate minimal stubs so the original lifecycle replays
// faithfully; 012 drops them again, leaving the same final state.
// `roadmaps` and `tenant_database_routes` are only ever named in a DROP IF
// EXISTS, so they need no stub at all.
const LIFECYCLE_STUBS = [
  {
    name: "users",
    cols: [
      { col: "id", typ: "uuid", notnull: true, def: "gen_random_uuid()" },
      { col: "user_id", typ: "text", notnull: true, def: null },
      { col: "tenant_id", typ: "uuid", notnull: false, def: null },
      { col: "created_at", typ: "timestamp with time zone", notnull: true, def: "now()" },
    ],
    pk: "users_pkey",
  },
  {
    name: "leaderboard_snapshots",
    cols: [
      { col: "id", typ: "uuid", notnull: true, def: "gen_random_uuid()" },
      { col: "scope", typ: "text", notnull: true, def: null },
      { col: "period", typ: "text", notnull: true, def: null },
      { col: "created_at", typ: "timestamp with time zone", notnull: true, def: "now()" },
    ],
    pk: "leaderboard_snapshots_pkey",
  },
];

const sql = postgres(databaseUrl(), { max: 1 });

const q = (s) => sql.unsafe(s);

const guard = (objName, conName, body) => `DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = '${conName}' AND conrelid = '${objName}'::regclass
  ) THEN
    ${body}
  END IF;
END $$;`;

try {
  const tables = await q(`
    SELECT c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname`);

  const columns = await q(`
    SELECT c.relname AS tbl, a.attname AS col,
           format_type(a.atttypid, a.atttypmod) AS typ,
           a.attnotnull AS notnull,
           a.attidentity AS identity,
           a.attgenerated AS generated,
           pg_get_expr(d.adbin, d.adrelid) AS def
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY c.relname, a.attnum`);

  const colsByTable = new Map();
  for (const r of columns) {
    if (!colsByTable.has(r.tbl)) colsByTable.set(r.tbl, []);
    colsByTable.get(r.tbl).push(r);
  }

  const constraints = await q(`
    SELECT c.conname AS name, c.conrelid::regclass::text AS tbl,
           c.contype AS type, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public' AND c.contype IN ('p','u','f','c')
    ORDER BY c.conname`);

  const indexes = await q(`
    SELECT i.indexdef AS def, ic.relname AS idx
    FROM pg_indexes i
    JOIN pg_class ic ON ic.relname = i.indexname
    JOIN pg_namespace inns ON inns.oid = ic.relnamespace AND inns.nspname = 'public'
    JOIN pg_index idx ON idx.indexrelid = ic.oid
    WHERE i.schemaname = 'public'
      AND NOT idx.indisprimary
      AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = idx.indexrelid)
    ORDER BY i.indexname`);

  const policies = await q(`
    SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies WHERE schemaname = 'public'
    ORDER BY tablename, policyname`);

  const functions = await q(`
    SELECT p.oid::regprocedure::text AS sig, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    ORDER BY p.oid`);

  const views = await q(`
    SELECT c.relname AS name, pg_get_viewdef(c.oid, true) AS def
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('v','m')
    ORDER BY c.relname`);

  const seqs = await q(`
    SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'S' ORDER BY c.relname`);

  const L = [];
  L.push("-- 000_base_schema: base tables captured from the original database.");
  L.push("--");
  L.push("-- GENERATED by load/export-schema.js -- do not hand-edit. To refresh,");
  L.push("-- re-run the exporter against a database whose base schema is authoritative,");
  L.push("-- and review the diff carefully.");
  L.push("--");
  L.push("-- Why: the original base tables were created directly in the Supabase SQL");
  L.push("-- editor and never captured in load/migrations/. Migration 001 only does");
  L.push("-- 'ALTER TABLE public.profiles ADD COLUMN ...', so a fresh project cannot be");
  L.push("-- built from migrations alone. This file closes that gap and also captures");
  L.push("-- three orphan migrations that were applied only in the SQL editor:");
  L.push("--   021_mentor_booking.sql               -> mentor_sessions table + columns");
  L.push("--   022_page_views.sql                   -> page_views table");
  L.push("--   023_mentor_sessions_created_at.sql   -> mentor_sessions.created_at");
  L.push("--");
  L.push("-- Everything below is idempotent so that migrations 001..N apply cleanly on top.");
  L.push(`-- Source: ${tables.length} tables, ${constraints.length} constraints, ${indexes.length} indexes, ${policies.length} policies, ${functions.length} functions.`);
  L.push("");
  L.push("SET statement_timeout = 0;");
  L.push("SET lock_timeout = 0;");
  L.push("");
  L.push("-- ===========================================================");
  L.push("-- REPLAY STUBS FOR TABLES THAT 012_drop_dead_tables.sql REMOVES");
  L.push("-- ===========================================================");
  L.push("--");
  L.push("-- These tables are gone from the live database, but migrations 001 and 006");
  L.push("-- reference them before 012 drops them. These minimal stubs let the original");
  L.push("-- migration sequence replay cleanly; 012 removes them again, so the final");
  L.push("-- schema is identical to the source. They carry no real data.");
  L.push("");
  for (const stub of LIFECYCLE_STUBS) {
    L.push(`CREATE TABLE IF NOT EXISTS public.${stub.name} (`);
    L.push(stub.cols.map((c) => {
      let s = "  " + c.col + " " + c.typ;
      if (c.notnull) s += " NOT NULL";
      if (c.def) s += " DEFAULT " + c.def;
      return s;
    }).join(",\n"));
    L.push(");");
    L.push(guard(`public.${stub.name}`, stub.pk,
      `ALTER TABLE public.${stub.name} ADD CONSTRAINT ${stub.pk} PRIMARY KEY (id);`));
    L.push("");
  }
  L.push("");
  L.push("-- ===========================================================");
  L.push("-- TABLES");
  L.push("-- ===========================================================");
  L.push("");

  for (const t of tables) {
    const cols = colsByTable.get(t.name) || [];
    const lines = cols.map((c) => {
      let s = "  " + c.col + " " + c.typ;
      if (c.identity) s += " GENERATED " + (c.identity === "a" ? "ALWAYS" : "BY DEFAULT") + " AS IDENTITY";
      if (c.generated && c.generated !== "") s += " GENERATED ALWAYS AS (" + c.generated + ") STORED";
      if (c.notnull) s += " NOT NULL";
      if (c.def && !c.identity && !(c.generated && c.generated !== "")) s += " DEFAULT " + c.def;
      return s;
    });
    L.push(`CREATE TABLE IF NOT EXISTS public.${t.name} (`);
    L.push(lines.join(",\n"));
    L.push(");");
    L.push("");
  }

  L.push("-- ===========================================================");
  L.push("-- CONSTRAINTS");
  L.push("-- ===========================================================");
  L.push("");
  const byType = { p: [], u: [], f: [], c: [] };
  for (const c of constraints) byType[c.type].push(c);
  // primary keys first so foreign keys can resolve their targets
  for (const type of ["p", "u", "c", "f"]) {
    for (const c of byType[type]) {
      L.push(guard(`public.${c.tbl}`, c.name, `ALTER TABLE public.${c.tbl} ADD CONSTRAINT ${c.name} ${c.def};`));
      L.push("");
    }
  }

  L.push("-- ===========================================================");
  L.push("-- SEQUENCES");
  L.push("-- ===========================================================");
  L.push("");
  if (!seqs.length) L.push("-- (none)");
  for (const s of seqs) {
    L.push(`CREATE SEQUENCE IF NOT EXISTS public.${s.name};`);
    L.push(guard(`public.${s.name}_seq`, `x`, `SELECT setval('public.${s.name}', 1, false);`).replace(`'public.${s.name}_seq'::regclass`, "'public." + s.name + "'::regclass"));
  }
  L.push("");

  L.push("-- ===========================================================");
  L.push("-- INDEXES");
  L.push("-- ===========================================================");
  L.push("");
  for (const i of indexes) {
    L.push(i.def.replace(/^CREATE (UNIQUE )?INDEX /, (m, u) => `CREATE ${u || ""}INDEX IF NOT EXISTS `) + ";");
  }
  L.push("");

  L.push("-- ===========================================================");
  L.push("-- VIEWS / MATERIALIZED VIEWS");
  L.push("-- ===========================================================");
  L.push("");
  if (!views.length) L.push("-- (none)");
  for (const v of views) {
    L.push(`CREATE OR REPLACE VIEW public.${v.name} AS\n${v.def};`);
    L.push("");
  }

  L.push("-- ===========================================================");
  L.push("-- FUNCTIONS");
  L.push("-- ===========================================================");
  L.push("");
  for (const f of functions) {
    L.push(f.def.trim().replace(/;$/, "") + ";");
    L.push("");
  }

  L.push("-- ===========================================================");
  L.push("-- ROW LEVEL SECURITY");
  L.push("-- ===========================================================");
  L.push("");
  const rlsTables = await q(`
    SELECT c.relname AS name, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
    ORDER BY c.relname`);
  for (const t of rlsTables) {
    L.push(`ALTER TABLE public.${t.name} ENABLE ROW LEVEL SECURITY;`);
    if (t.forced) L.push(`ALTER TABLE public.${t.name} FORCE ROW LEVEL SECURITY;`);
  }
  L.push("");
  for (const p of policies) {
    const roles = Array.isArray(p.roles) ? p.roles.map((r) => (r === "public" ? "public" : `"${r}"`)).join(", ") : "public";
    const parts = [`CREATE POLICY ${p.policyname}`, `ON public.${p.tablename}`, `AS ${String(p.permissive).toUpperCase()}`];
    if (p.cmd && p.cmd !== "ALL") parts.push(`FOR ${p.cmd}`);
    parts.push(`TO ${roles}`);
    if (p.qual) parts.push(`USING (${p.qual})`);
    if (p.with_check) parts.push(`WITH CHECK (${p.with_check})`);
    L.push(`DROP POLICY IF EXISTS ${p.policyname} ON public.${p.tablename};`);
    L.push(parts.join(" ") + ";");
    L.push("");
  }

  L.push("");
  L.push("-- ===========================================================");
  L.push("-- GRANTS");
  L.push("-- ===========================================================");
  L.push("");
  L.push("-- Intentionally restrictive: the app connects as the table owner over the");
  L.push("-- pooler and relies on RLS for tenant isolation. anon/authenticated get no");
  L.push("-- direct grants, so a leaked key cannot read tables even if RLS were bypassed.");
  L.push(`DO $$
BEGIN
  EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC');
  EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon');
  EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated');
  EXECUTE format('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
END $$;`);
  L.push("");
  L.push("-- end of 000_base_schema");
  L.push("");

  fs.writeFileSync(OUT, L.join("\n"), "utf8");
  console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
  console.log(`  tables=${tables.length} constraints=${constraints.length} indexes=${indexes.length} policies=${policies.length} functions=${functions.length} views=${views.length} sequences=${seqs.length}`);
  console.log(`  bytes=${fs.statSync(OUT).size}`);
} catch (e) {
  console.error("export-schema failed:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}