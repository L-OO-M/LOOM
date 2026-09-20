import postgres from "postgres";
import { databaseUrl } from "./env-local.js";

const DATABASE_URL = databaseUrl();
const sql = postgres(DATABASE_URL, { max: 1 });

try {
  // Ensure migration 023 columns exist (idempotent)
  await sql.unsafe(`
    ALTER TABLE public.roadmap_nodes ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'topic' CHECK (kind IN ('topic','group','label'));
    ALTER TABLE public.roadmap_nodes ADD COLUMN IF NOT EXISTS group_id text REFERENCES public.roadmap_nodes(id) ON DELETE SET NULL;
    ALTER TABLE public.roadmap_nodes ADD COLUMN IF NOT EXISTS is_highlighted boolean NOT NULL DEFAULT false;
    ALTER TABLE public.roadmap_nodes ADD COLUMN IF NOT EXISTS is_optional boolean NOT NULL DEFAULT false;
    ALTER TABLE public.roadmap_nodes ADD COLUMN IF NOT EXISTS x integer;
    ALTER TABLE public.roadmap_nodes ADD COLUMN IF NOT EXISTS y integer;
  `);
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS public.roadmap_edges (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      from_id text NOT NULL REFERENCES public.roadmap_nodes(id) ON DELETE CASCADE,
      to_id text NOT NULL REFERENCES public.roadmap_nodes(id) ON DELETE CASCADE,
      kind text NOT NULL DEFAULT 'required' CHECK (kind IN ('required','optional','alternative')),
      label text,
      UNIQUE(from_id,to_id)
    );
    CREATE INDEX IF NOT EXISTS roadmap_edges_from_idx ON public.roadmap_edges(from_id);
    CREATE INDEX IF NOT EXISTS roadmap_edges_to_idx ON public.roadmap_edges(to_id);
  `);

  // Rich canary: Android-inspired but mapped to L.O.O.M. web/mobile track
  // Yellow = is_highlighted true (recommended path), beige = normal
  const nodes = [
    // spine
    { id: "rm_android", title: "Android", domain: "web", sort_order: 10, is_highlighted: false, is_optional: false },
    { id: "rm_pick_lang", title: "Pick a Language", domain: "web", sort_order: 11, is_highlighted: true, is_optional: false },
    { id: "rm_kotlin", title: "Kotlin", domain: "web", sort_order: 12, is_highlighted: false, is_optional: true },
    { id: "rm_java", title: "Java", domain: "web", sort_order: 13, is_highlighted: false, is_optional: true },
    { id: "rm_git", title: "Git", domain: "web", sort_order: 14, is_highlighted: false, is_optional: false },
    { id: "rm_fundamentals", title: "The Fundamentals", domain: "web", sort_order: 15, is_highlighted: true, is_optional: false },
    { id: "rm_vcs", title: "Version Control", domain: "web", sort_order: 16, is_highlighted: true, is_optional: false },
    { id: "rm_github", title: "GitHub", domain: "web", sort_order: 17, is_highlighted: false, is_optional: true },
    { id: "rm_bitbucket", title: "Bitbucket", domain: "web", sort_order: 18, is_highlighted: false, is_optional: true },
    { id: "rm_gitlab", title: "GitLab", domain: "web", sort_order: 19, is_highlighted: false, is_optional: true },
    { id: "rm_app_comp", title: "App Components", domain: "web", sort_order: 20, is_highlighted: true, is_optional: false },
    { id: "rm_jetpack", title: "Jetpack Compose", domain: "web", sort_order: 21, is_highlighted: false, is_optional: true },
    { id: "rm_ui_nav", title: "Interface & Navigation", domain: "web", sort_order: 22, is_highlighted: true, is_optional: false },
    { id: "rm_storage", title: "Storage", domain: "backend", sort_order: 30, is_highlighted: true, is_optional: false },
    { id: "rm_security", title: "Security", domain: "backend", sort_order: 31, is_highlighted: true, is_optional: false },
    { id: "rm_network", title: "Network", domain: "backend", sort_order: 32, is_highlighted: true, is_optional: false },
    { id: "rm_async", title: "Asynchronism", domain: "backend", sort_order: 33, is_highlighted: true, is_optional: false },
    { id: "rm_testing", title: "Testing", domain: "backend", sort_order: 34, is_highlighted: true, is_optional: false },
    { id: "rm_debugging", title: "Debugging", domain: "devops", sort_order: 40, is_highlighted: true, is_optional: false },
    { id: "rm_distribution", title: "Distribution", domain: "devops", sort_order: 41, is_highlighted: true, is_optional: false },
    // group labels (visual frames)
    { id: "rm_group_vcs_host", title: "VCS Hosting", domain: "web", sort_order: 50, kind: "label", is_highlighted: false, is_optional: false },
    { id: "rm_group_services", title: "Services / Intent / Activity", domain: "web", sort_order: 51, kind: "label", is_highlighted: false, is_optional: false },
  ];

  for (const n of nodes) {
    const desc = n.title + ' — roadmap step';
    await sql`
      INSERT INTO roadmap_nodes (id, title, description, domain, sort_order, kind, is_highlighted, is_optional)
      VALUES (${n.id}, ${n.title}, ${desc}, ${n.domain}, ${n.sort_order}, ${n.kind || 'topic'}, ${n.is_highlighted}, ${n.is_optional})
      ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, is_highlighted = EXCLUDED.is_highlighted, is_optional = EXCLUDED.is_optional, kind = EXCLUDED.kind, description = EXCLUDED.description
    `;
  }
  console.log(`Upserted ${nodes.length} graph nodes`);

  const edges = [
    // Pick a language fan-out (dotted alternative)
    { from_id: "rm_pick_lang", to_id: "rm_kotlin", kind: "alternative" },
    { from_id: "rm_pick_lang", to_id: "rm_java", kind: "alternative" },
    { from_id: "rm_android", to_id: "rm_pick_lang", kind: "required" },
    { from_id: "rm_pick_lang", to_id: "rm_fundamentals", kind: "required" },
    { from_id: "rm_git", to_id: "rm_fundamentals", kind: "optional" },
    { from_id: "rm_fundamentals", to_id: "rm_vcs", kind: "required" },
    { from_id: "rm_vcs", to_id: "rm_github", kind: "optional" },
    { from_id: "rm_vcs", to_id: "rm_bitbucket", kind: "optional" },
    { from_id: "rm_vcs", to_id: "rm_gitlab", kind: "optional" },
    { from_id: "rm_fundamentals", to_id: "rm_app_comp", kind: "required" },
    { from_id: "rm_app_comp", to_id: "rm_jetpack", kind: "optional" },
    { from_id: "rm_fundamentals", to_id: "rm_ui_nav", kind: "required" },
    { from_id: "rm_vcs", to_id: "rm_storage", kind: "required" },
    { from_id: "rm_storage", to_id: "rm_security", kind: "required" },
    { from_id: "rm_security", to_id: "rm_network", kind: "required" },
    { from_id: "rm_network", to_id: "rm_async", kind: "required" },
    { from_id: "rm_async", to_id: "rm_testing", kind: "required" },
    { from_id: "rm_testing", to_id: "rm_debugging", kind: "required" },
    { from_id: "rm_debugging", to_id: "rm_distribution", kind: "required" },
    { from_id: "rm_distribution", to_id: "rm_pick_lang", kind: "optional" },
  ];

  for (const e of edges) {
    await sql`
      INSERT INTO roadmap_edges (from_id, to_id, kind)
      VALUES (${e.from_id}, ${e.to_id}, ${e.kind})
      ON CONFLICT (from_id, to_id) DO UPDATE SET kind = EXCLUDED.kind
    `;
  }
  console.log(`Upserted ${edges.length} edges`);

  // Keep original 7 nodes as fallback (already seeded) — ensure they connect into graph
  const fallbackEdges = [
    { from_id: "node_html_css", to_id: "node_javascript", kind: "required" },
    { from_id: "node_javascript", to_id: "node_git_github", kind: "required" },
    { from_id: "node_git_github", to_id: "node_react", kind: "required" },
    { from_id: "node_react", to_id: "node_node", kind: "required" },
    { from_id: "node_node", to_id: "node_database", kind: "required" },
    { from_id: "node_database", to_id: "node_deploy", kind: "required" },
  ];
  for (const e of fallbackEdges) {
    await sql`
      INSERT INTO roadmap_edges (from_id, to_id, kind)
      VALUES (${e.from_id}, ${e.to_id}, ${e.kind})
      ON CONFLICT (from_id, to_id) DO NOTHING
    `;
  }
  console.log("Seeded fallback linear edges");
} catch (e) {
  console.error("Seed graph failed:", e.message);
  console.error(e);
} finally {
  await sql.end();
}
