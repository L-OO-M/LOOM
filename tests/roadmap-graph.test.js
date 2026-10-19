import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Canonical roadmap graph integrity: ordering, edge validity, acyclicity and
// reachability — derived from load/roadmap-data/*.json, the same source of
// truth load/seed-roadmaps.js reads.
const DIR = path.join(process.cwd(), "load", "roadmap-data");
const FILES = ["ai_ml.json", "web.json", "cybersecurity.json", "embedded.json", "python.json", "dsa_blockchain.json"];

function loadTracks() {
  const tracks = [];
  for (const f of FILES) {
    const raw = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
    if (Array.isArray(raw.tracks)) tracks.push(...raw.tracks);
    else tracks.push({ domain: raw.domain, groups: raw.groups || [] });
  }
  return tracks;
}

// Mirrors seed-roadmaps.js: group order first, authored order within a group.
function build() {
  const nodes = new Map();
  const edges = [];
  let order = 200;
  for (const t of loadTracks()) {
    for (const g of t.groups || []) {
      const groupOrder = order++;
      (g.nodes || []).forEach((n, i) => {
        if (!nodes.has(n.id)) {
          nodes.set(n.id, {
            id: n.id, domain: n.domain || t.domain, group: g.title,
            groupOrder, index: i, sortOrder: groupOrder * 100 + i,
          });
        }
      });
      for (const e of g.edges || []) edges.push({ ...e, domain: t.domain });
    }
  }
  return { nodes, edges };
}

const { nodes, edges } = build();
const VALID_KINDS = new Set(["required", "optional", "alternative"]);

describe("canonical roadmap graph", () => {
  it("covers every canonical node", () => {
    expect(nodes.size).toBe(321);
    expect([...nodes.values()].some((n) => n.id.startsWith("rm_"))).toBe(false);
  });

  it("orders nodes by group, then by authored position within the group", () => {
    for (const track of loadTracks()) {
      for (const g of track.groups || []) {
        const inDomain = (g.nodes || []).map((n) => nodes.get(n.id)).filter(Boolean);
        const orders = inDomain.map((n) => n.sortOrder);
        const increasing = orders.every((v, i) => i === 0 || v > orders[i - 1]);
        expect(increasing, `${g.title} order`).toBe(true);
      }
    }
  });

  it("has no duplicate edges, self-loops, or dangling endpoints", () => {
    const seen = new Set();
    for (const e of edges) {
      const k = `${e.from_id}->${e.to_id}`;
      expect(seen.has(k), `duplicate ${k}`).toBe(false);
      seen.add(k);
      expect(e.from_id, "self loop").not.toBe(e.to_id);
      expect(nodes.has(e.from_id), `dangling from ${e.from_id}`).toBe(true);
      expect(nodes.has(e.to_id), `dangling to ${e.to_id}`).toBe(true);
      expect(VALID_KINDS.has(e.kind), `bad kind on ${k}`).toBe(true);
    }
  });

  it("never points a required prerequisite backwards through the sequence", () => {
    // `required` is the only edge kind that asserts "learn this first", so it
    // is the only one that must flow forward. optional/alternative are
    // suggestions and may legitimately point between sibling electives.
    for (const e of edges) {
      if (e.kind !== "required") continue;
      const a = nodes.get(e.from_id).sortOrder;
      const b = nodes.get(e.to_id).sortOrder;
      expect(a, `backward required edge ${e.from_id}->${e.to_id}`).toBeLessThan(b);
    }
  });

  it("is acyclic", () => {
    const adj = new Map([...nodes.keys()].map((i) => [i, []]));
    for (const e of edges) adj.get(e.from_id).push(e.to_id);
    const state = new Map();
    let cycle = null;
    const visit = (n, stack) => {
      if (cycle) return;
      state.set(n, 1);
      for (const m of adj.get(n)) {
        if (state.get(m) === 1) { cycle = [...stack, m]; return; }
        if (!state.get(m)) visit(m, [...stack, m]);
      }
      state.set(n, 2);
    };
    for (const id of nodes.keys()) if (!state.get(id)) visit(id, [id]);
    expect(cycle, `cycle: ${cycle && cycle.join(" -> ")}`).toBeNull();
  });

  it("gives the linear tracks exactly one starting point", () => {
    const single = (ids) => {
      const set = new Set(ids);
      const de = edges.filter((e) => set.has(e.from_id) && set.has(e.to_id));
      const inDeg = new Map([...set].map((i) => [i, 0]));
      for (const e of de) inDeg.set(e.to_id, inDeg.get(e.to_id) + 1);
      return [...set].filter((i) => inDeg.get(i) === 0);
    };
    expect(single(["web_html5", "web_css3", "web_javascript_core", "web_git_github",
      "web_dev_tools_fundamentals", "web_css_frameworks", "web_react_fundamentals",
      "web_react_intermediate", "web_react_advanced", "web_mern_portfolio_projects"]))
      .toEqual(["web_html5"]);
    expect(single(["web_dsa_track", "dsa_striver", "dsa_neetcode_150",
      "dsa_leetcode_codeforces", "dsa_karumahchi"])).toEqual(["web_dsa_track"]);
    expect(single(["bc_patrick_collins", "bc_daulat_hussain", "bc_hackquest",
      "bc_mit_ocw", "bc_harkirat_cohort", "bc_udemy_solidity"])).toEqual(["bc_patrick_collins"]);
    expect(single(["web_deployment", "web_microservices_cloud_native", "web_java_deployment"])
      .sort()).toEqual(["web_deployment", "web_microservices_cloud_native"]);
  });

  it("keeps showcase and platform tracks optional (electives, never forced)", () => {
    // Project showcases may chain to each other, but only optionally — they
    // must never become a required linear progression.
    const showcases = ["rpi_as_we_are", "rpi_yuri_3_mars_rover", "rpi_sofi", "rpi_teslonda",
      "rpi_pi_fighter", "rpi_squirrel_cafe", "rpi_tide_clock_weather_thing",
      "rpi_a_whisper_of_moths", "rpi_underwater_drone", "rpi_chord_assist", "rpi_tv_wall",
      "rpi_telepresence_hand", "rpi_pi_vizuwall", "rpi_smart_home_herb_garden",
      "rpi_marvin_go_kart", "rpi_tortoise_fridge", "rpi_immersive_bar"];
    for (const id of showcases) expect(nodes.has(id), id).toBe(true);
    for (const e of edges) {
      if (showcases.includes(e.from_id) && showcases.includes(e.to_id)) {
        expect(["optional", "alternative"], `${e.from_id}->${e.to_id}`).toContain(e.kind);
      }
    }
  });

  it("links Fluent Python chapters forward only (the removed cycle edge stays gone)", () => {
    expect(edges.some((e) => e.from_id === "py_more_about_type_hints"
      && e.to_id === "py_type_hints_in_functions")).toBe(false);
    expect(edges.some((e) => e.from_id === "py_interfaces_protocols_and_abcs"
      && e.to_id === "py_more_about_type_hints")).toBe(true);
  });
});