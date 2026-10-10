// Seeds every domain roadmap graph + curated resource from load/roadmap-data/*.json
// Usage: node --import ./load/env-local.js load/seed-roadmaps.js
//
// PROVENANCE: every title/description/URL in load/roadmap-data/ is transcribed
// from the source documents supplied by the chapter. Nothing is invented:
//   - `minutes` is never written (sources gave no durations -> no fake time)
//   - `url` stays null wherever a source listed a book/topic without a link
//
// Idempotent: fixed ids + ON CONFLICT DO UPDATE, safe to re-run.
// Also removes the legacy placeholder graph (rm_*) that pre-dated the real
// roadmaps, so the student graph shows only sourced content.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { databaseUrl } from "./env-local.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "roadmap-data");
const DRY_RUN = process.argv.includes("--dry-run");
const sql = postgres(DRY_RUN ? "postgres://dry:run@localhost:1/none" : databaseUrl(), { max: 1 });

const VALID_KINDS = new Set(["article", "doc", "video", "course"]);
const VALID_LEVELS = new Set(["foundation", "foundation_plus"]);
const VALID_DIFF = new Set(["beginner", "intermediate", "advanced"]);
const VALID_EDGE_KINDS = new Set(["required", "optional", "alternative"]);

// Fallback when a source node has no description (roadmap_nodes.description is NOT NULL).
const DEFAULT_DESCRIPTION = (title) => `${title} — roadmap step`;

const problems = [];
const allNodes = new Map();
const allEdges = [];
const allResources = new Map();
const tracks = [];

function load(file) {
  const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
  // Normalise single-domain vs multi-domain track files into a uniform shape.
  if (Array.isArray(raw.tracks)) return raw.tracks;
  return [
    {
      domain: raw.domain,
      label: raw.label,
      groups: raw.groups || [],
      resources: (raw.resources || []).map((r) => ({ ...r, domain: r.domain || raw.domain })),
    },
  ];
}

const FILES = ["ai_ml.json", "web.json", "cybersecurity.json", "embedded.json", "python.json", "dsa_blockchain.json"];
for (const f of FILES) tracks.push(...load(f));

// ---- validate + flatten -------------------------------------------------
let order = 200;
for (const track of tracks) {
  for (const group of track.groups) {
    const groupOrder = order++;
    for (const node of group.nodes) {
      if (!node.id) { problems.push(`${track.domain}: node without id in "${group.title}"`); continue; }
      if (allNodes.has(node.id)) problems.push(`duplicate node id: ${node.id}`);
      if (!VALID_DIFF.has(node.difficulty_level)) problems.push(`bad difficulty_level on ${node.id}: ${node.difficulty_level}`);
      allNodes.set(node.id, {
        id: node.id,
        title: node.title,
        description: node.description || DEFAULT_DESCRIPTION(node.title),
        domain: node.domain || track.domain,
        sort_order: groupOrder,
        kind: node.kind || "topic",
        is_highlighted: !!node.is_highlighted,
        is_optional: !!node.is_optional,
        difficulty_level: node.difficulty_level,
        group_title: group.title,
      });
    }
    for (const e of group.edges || []) {
      if (!VALID_EDGE_KINDS.has(e.kind)) problems.push(`bad edge kind on ${e.from_id}->${e.to_id}: ${e.kind}`);
      allEdges.push({ from_id: e.from_id, to_id: e.to_id, kind: e.kind });
    }
  }
  for (const r of track.resources || []) {
    if (!r.id) { problems.push(`${track.domain}: resource without id`); continue; }
    if (allResources.has(r.id)) problems.push(`duplicate resource id: ${r.id}`);
    if (!VALID_KINDS.has(r.kind)) problems.push(`bad kind on ${r.id}: ${r.kind}`);
    if (!VALID_LEVELS.has(r.level)) problems.push(`bad level on ${r.id}: ${r.level}`);
    if (r.url && !/^https?:\/\//i.test(r.url)) problems.push(`url not absolute on ${r.id}: ${r.url}`);
    allResources.set(r.id, {
      id: r.id,
      title: r.title,
      domain: r.domain || track.domain,
      kind: r.kind,
      level: r.level,
      url: r.url || null,
    });
  }
}

// ---- edge integrity: every endpoint must exist -------------------------
for (const e of allEdges) {
  if (!allNodes.has(e.from_id)) problems.push(`edge from unknown node: ${e.from_id}`);
  if (!allNodes.has(e.to_id)) problems.push(`edge to unknown node: ${e.to_id}`);
  if (e.from_id === e.to_id) problems.push(`self edge: ${e.from_id}`);
}

if (problems.length) {
  console.error(`VALIDATION FAILED (${problems.length} problems):`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}

const stats = {};
for (const n of allNodes.values()) stats[n.domain] = (stats[n.domain] || 0) + 1;
const resStats = {};
for (const r of allResources.values()) resStats[r.domain] = (resStats[r.domain] || 0) + 1;

console.log(`VALIDATION OK — ${allNodes.size} nodes, ${allEdges.length} edges, ${allResources.size} resources`);
console.log("  nodes by domain :", Object.entries(stats).sort().map(([d, c]) => `${d}=${c}`).join(", "));
console.log("  resources       :", Object.entries(resStats).sort().map(([d, c]) => `${d}=${c}`).join(", "));
const noUrl = [...allResources.values()].filter((r) => !r.url).length;
console.log(`  resources with no URL (kept null, no invented link): ${noUrl}`);

if (DRY_RUN) {
  console.log("--dry-run: validated, nothing written to the database.");
  process.exit(0);
}

// ---- write ---------------------------------------------------------------
try {
  // Retire the pre-source placeholder graph so students only see real content.
  const legacy = await sql`SELECT id FROM roadmap_nodes WHERE id LIKE 'rm\_%'`;
  if (legacy.length) {
    await sql`DELETE FROM roadmap_edges WHERE from_id LIKE 'rm\_%' OR to_id LIKE 'rm\_%'`;
    await sql`DELETE FROM roadmap_nodes WHERE id LIKE 'rm\_%'`;
    console.log(`removed ${legacy.length} legacy rm_* placeholder nodes`);
  }

  let n = 0;
  for (const node of allNodes.values()) {
    await sql`
      INSERT INTO roadmap_nodes (id, title, description, domain, sort_order, kind, is_highlighted, is_optional, difficulty_level)
      VALUES (${node.id}, ${node.title}, ${node.description}, ${node.domain}, ${node.sort_order},
              ${node.kind}, ${node.is_highlighted}, ${node.is_optional}, ${node.difficulty_level})
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title, description = EXCLUDED.description, domain = EXCLUDED.domain,
        sort_order = EXCLUDED.sort_order, kind = EXCLUDED.kind,
        is_highlighted = EXCLUDED.is_highlighted, is_optional = EXCLUDED.is_optional,
        difficulty_level = EXCLUDED.difficulty_level
    `;
    n++;
  }
  console.log(`Upserted ${n} roadmap nodes`);

  let e = 0;
  for (const edge of allEdges) {
    await sql`
      INSERT INTO roadmap_edges (from_id, to_id, kind)
      VALUES (${edge.from_id}, ${edge.to_id}, ${edge.kind})
      ON CONFLICT (from_id, to_id) DO UPDATE SET kind = EXCLUDED.kind
    `;
    e++;
  }
  console.log(`Upserted ${e} roadmap edges`);

  let r = 0;
  for (const res of allResources.values()) {
    await sql`
      INSERT INTO resources (id, title, domain, kind, level, url)
      VALUES (${res.id}, ${res.title}, ${res.domain}, ${res.kind}, ${res.level}, ${res.url})
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title, domain = EXCLUDED.domain, kind = EXCLUDED.kind,
        level = EXCLUDED.level, url = EXCLUDED.url
    `;
    r++;
  }
  console.log(`Upserted ${r} curated resources`);

  console.log("nodes per domain:", Object.entries(stats).sort().map(([d, c]) => `${d}=${c}`).join(", "));
  console.log(`tracks: ${tracks.map((t) => t.domain).join(", ")}`);
  console.log("done. All titles/URLs transcribed from the supplied source documents.");
} catch (e) {
  console.error("seed-roadmaps failed:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}