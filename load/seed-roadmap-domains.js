// Seeds per-domain roadmap graphs + curated resources from the pasted source data.
// Usage: node --import ./load/env-local.js load/seed-roadmap-domains.js
//
// SCOPE / PROVENANCE:
//   Every node title, resource title and URL below is transcribed verbatim from
//   the source text supplied by the chapter. Nothing is invented: no courses,
//   no links, no durations that were not in the source. Where the source gave a
//   book with no URL, `url` stays null. Where it gave no time estimate, the
//   `minutes` column is left at its default so the UI shows no fake number.
//
//   Domains covered here: cybersecurity, dsa, blockchain, embedded.
//   (ai_ml + web come from load/seed-content.js and their PDFs were not
//   supplied as text, so they are intentionally untouched.)
//
// Idempotent: fixed ids + ON CONFLICT DO UPDATE, safe to re-run.
import postgres from "postgres";
import { databaseUrl } from "./env-local.js";

const sql = postgres(databaseUrl(), { max: 1 });

// ---------------------------------------------------------------------------
// ROADMAP NODES — grouped exactly as the source groups them
// kind: 'label' = visual group frame, 'topic' = a real step
// is_optional / is_highlighted drive edge kind and node colour in the graph
// ---------------------------------------------------------------------------
const NODES = [
  // ===================== CYBERSECURITY =====================
  { id: "cy_linux", title: "Linux", domain: "cybersecurity", sort_order: 200, kind: "topic", is_highlighted: true, is_optional: false,
    description: "Start here. Source lists Linux first, before any practice platform." },
  { id: "cy_curated", title: "Curated resource list", domain: "cybersecurity", sort_order: 201, kind: "topic", is_highlighted: false, is_optional: true,
    description: "Full list of curated resources." },
  { id: "cy_tryhackme", title: "TryHackMe", domain: "cybersecurity", sort_order: 202, kind: "topic", is_highlighted: true, is_optional: false,
    description: "Guided security labs and rooms." },
  { id: "cy_overthewire", title: "OverTheWire wargames", domain: "cybersecurity", sort_order: 203, kind: "topic", is_highlighted: true, is_optional: false,
    description: "Wargames for hands-on practice." },
  { id: "cy_pwn_college", title: "pwn.college", domain: "cybersecurity", sort_order: 204, kind: "topic", is_highlighted: true, is_optional: false,
    description: "Practice environment for security skills." },
  { id: "cy_label_practice", title: "Practice platforms", domain: "cybersecurity", sort_order: 204, kind: "label", is_highlighted: false, is_optional: false,
    description: "Where the practice happens." },
  { id: "cy_portswigger", title: "PortSwigger Web Security", domain: "cybersecurity", sort_order: 205, kind: "topic", is_highlighted: true, is_optional: false,
    description: "Web security, attack and defence." },
  { id: "cy_ctflearn", title: "CTFlearn", domain: "cybersecurity", sort_order: 206, kind: "topic", is_highlighted: true, is_optional: false,
    description: "CTF-style challenges by category." },
  { id: "cy_cylab_academy", title: "CYLAB Academy", domain: "cybersecurity", sort_order: 207, kind: "topic", is_highlighted: true, is_optional: false,
    description: "Formerly known as picoCTF." },
  { id: "cy_cryptohack", title: "CryptoHack", domain: "cybersecurity", sort_order: 208, kind: "topic", is_highlighted: true, is_optional: false,
    description: "Learning cryptography." },
  { id: "cy_label_crypto", title: "Cryptography", domain: "cybersecurity", sort_order: 209, kind: "label", is_highlighted: false, is_optional: false,
    description: "Cryptography track." },
  { id: "cy_label_cert", title: "Cryptography — paid certification", domain: "cybersecurity", sort_order: 210, kind: "label", is_highlighted: false, is_optional: false,
    description: "Paid for certification." },
  { id: "cy_nptel_foundations_crypto", title: "Foundations of Cryptography", domain: "cybersecurity", sort_order: 211, kind: "topic", is_highlighted: true, is_optional: false,
    description: "IIIT Bangalore. By Prof. Ashish Choudhury." },
  { id: "cy_nptel_network_security", title: "Network Security", domain: "cybersecurity", sort_order: 212, kind: "topic", is_highlighted: false, is_optional: true,
    description: "By Prof. Gaurav S. Kasbekar." },
  { id: "cy_label_channels", title: "Latest tech & CTF channels", domain: "cybersecurity", sort_order: 213, kind: "label", is_highlighted: false, is_optional: false,
    description: "To learn latest tech, and to learn about CTFs." },
  { id: "cy_networkchuck", title: "NetworkChuck", domain: "cybersecurity", sort_order: 214, kind: "topic", is_highlighted: false, is_optional: true,
    description: "To learn about latest tech." },
  { id: "cy_bitten_tech", title: "Bitten Tech", domain: "cybersecurity", sort_order: 215, kind: "topic", is_highlighted: false, is_optional: true,
    description: "To learn about CTFs." },
  { id: "cy_john_hammond", title: "John Hammond", domain: "cybersecurity", sort_order: 216, kind: "topic", is_highlighted: false, is_optional: true,
    description: "To learn about CTFs." },
  { id: "cy_label_self_study", title: "Self study resources", domain: "cybersecurity", sort_order: 217, kind: "label", is_highlighted: false, is_optional: false,
    description: "Also refer to." },
  { id: "cy_nfsu_study", title: "NFSU CyberSecurity Study Material", domain: "cybersecurity", sort_order: 218, kind: "topic", is_highlighted: false, is_optional: true,
    description: "Self study resource." },
  { id: "cy_label_books", title: "Books", domain: "cybersecurity", sort_order: 219, kind: "label", is_highlighted: false, is_optional: false,
    description: "Books for the track." },
  { id: "cy_python_security_books", title: "Python for Penetration Testing & Cybersecurity", domain: "cybersecurity", sort_order: 220, kind: "topic", is_highlighted: false, is_optional: true,
    description: "Book listing for security scripting." },

  // ===================== DSA =====================
  { id: "dsa_label_free", title: "Free", domain: "dsa", sort_order: 230, kind: "label", is_highlighted: false, is_optional: false,
    description: "Free resources." },
  { id: "dsa_striver", title: "Striver's A2Z sheet", domain: "dsa", sort_order: 231, kind: "topic", is_highlighted: true, is_optional: false,
    description: "Learn DSA A to Z." },
  { id: "dsa_neetcode_150", title: "Neetcode 150", domain: "dsa", sort_order: 232, kind: "topic", is_highlighted: true, is_optional: false,
    description: "For practice." },
  { id: "dsa_leetcode_codeforces", title: "LeetCode and Codeforces editorial", domain: "dsa", sort_order: 233, kind: "topic", is_highlighted: true, is_optional: false,
    description: "Study editorials after attempting." },
  { id: "dsa_label_paid", title: "Paid", domain: "dsa", sort_order: 234, kind: "label", is_highlighted: false, is_optional: false,
    description: "Paid resources." },
  { id: "dsa_karumahchi", title: "Data Structures and Algorithms made easy", domain: "dsa", sort_order: 235, kind: "topic", is_highlighted: false, is_optional: true,
    description: "By Narsimha Karumahchi." },

  // ===================== BLOCKCHAIN & WEB3 =====================
  { id: "bc_label_free", title: "Free", domain: "blockchain", sort_order: 250, kind: "label", is_highlighted: false, is_optional: false,
    description: "Free resources." },
  { id: "bc_patrick_collins", title: "Patrick Collins", domain: "blockchain", sort_order: 251, kind: "topic", is_highlighted: true, is_optional: false,
    description: "Free channel on web3 and smart contracts." },
  { id: "bc_daulat_hussain", title: "Daulat Hussain", domain: "blockchain", sort_order: 252, kind: "topic", is_highlighted: true, is_optional: false,
    description: "Free channel on web3 and smart contracts." },
  { id: "bc_hackquest", title: "Web3 programming for everyone", domain: "blockchain", sort_order: 253, kind: "topic", is_highlighted: true, is_optional: false,
    description: "HackQuest." },
  { id: "bc_mit_ocw", title: "MIT OpenCourseWare", domain: "blockchain", sort_order: 254, kind: "topic", is_highlighted: true, is_optional: false,
    description: "MIT OpenCourseWare." },
  { id: "bc_label_paid", title: "Paid", domain: "blockchain", sort_order: 255, kind: "label", is_highlighted: false, is_optional: false,
    description: "Paid resources." },
  { id: "bc_harkirat_cohort", title: "Harkirat web3 cohort — 100xDevs", domain: "blockchain", sort_order: 256, kind: "topic", is_highlighted: false, is_optional: true,
    description: "Harkirat web3 cohort." },
  { id: "bc_udemy_solidity", title: "Master Solidity", domain: "blockchain", sort_order: 257, kind: "topic", is_highlighted: false, is_optional: true,
    description: "By TOON Macharis. On Udemy." },

  // ===================== EMBEDDED SYSTEMS =====================
  // NOTE: `embedded` is not yet a department/domain in the taxonomy
  // (see load/seed-departments.js: ai_ml, web, cybersecurity, dsa, blockchain).
  // These nodes exist in the graph but will not show in the resources filter
  // chips until an `embedded` domain + department is added.
  { id: "em_arduino_beginners", title: "Arduino course for beginners", domain: "embedded", sort_order: 270, kind: "topic", is_highlighted: true, is_optional: false,
    description: "Start here for microcontrollers." },
  { id: "em_stm32_boards", title: "Starting out with STM32 dev boards", domain: "embedded", sort_order: 271, kind: "topic", is_highlighted: true, is_optional: false,
    description: "STM32 development boards." },
  { id: "em_cortex_m3_book", title: "The definite guide to ARM Cortex M3", domain: "embedded", sort_order: 272, kind: "topic", is_highlighted: true, is_optional: false,
    description: "Book." },
  { id: "em_stm32_register", title: "STM32 (ARM Cortex) register level programming", domain: "embedded", sort_order: 273, kind: "topic", is_highlighted: true, is_optional: false,
    description: "Register level programming." },
  { id: "em_rtos_beginners", title: "RTOS for beginners", domain: "embedded", sort_order: 274, kind: "topic", is_highlighted: false, is_optional: true,
    description: "Real-time operating systems." },
  { id: "em_serial_communication", title: "Fundamentals of serial communication", domain: "embedded", sort_order: 275, kind: "topic", is_highlighted: true, is_optional: false,
    description: "Serial communication fundamentals." },
  { id: "em_label_reference_books", title: "Books — reference only", domain: "embedded", sort_order: 276, kind: "label", is_highlighted: false, is_optional: false,
    description: "The books below are just for reference, not for IPU exams." },
  { id: "em_microelectric_circuits", title: "Microelectric Circuits: Analysis and Design", domain: "embedded", sort_order: 277, kind: "topic", is_highlighted: false, is_optional: true,
    description: "By Muhammad H. Rashid. Reference only, not for IPU exams." },
  { id: "em_art_of_electronics", title: "The Art of Electronics 3rd Edition (2015)", domain: "embedded", sort_order: 278, kind: "topic", is_highlighted: false, is_optional: true,
    description: "Reference only, not for IPU exams." },
];

// ---------------------------------------------------------------------------
// EDGES — branching DAG per domain
// required (blue solid) = the source's stated order
// alternative (amber) = source lists them as separate valid starting points
// optional (grey dashed) = reference material, not a gate
// ---------------------------------------------------------------------------
const EDGES = [
  // Cybersecurity — source order: Linux first, then practice platforms
  { from_id: "cy_linux", to_id: "cy_tryhackme", kind: "required" },
  { from_id: "cy_linux", to_id: "cy_overthewire", kind: "alternative" },
  { from_id: "cy_linux", to_id: "cy_pwn_college", kind: "alternative" },
  { from_id: "cy_curated", to_id: "cy_tryhackme", kind: "optional" },
  { from_id: "cy_tryhackme", to_id: "cy_portswigger", kind: "required" },
  { from_id: "cy_tryhackme", to_id: "cy_ctflearn", kind: "alternative" },
  { from_id: "cy_tryhackme", to_id: "cy_cylab_academy", kind: "alternative" },
  { from_id: "cy_ctflearn", to_id: "cy_cylab_academy", kind: "optional" },
  { from_id: "cy_portswigger", to_id: "cy_cryptohack", kind: "required" },
  { from_id: "cy_cylab_academy", to_id: "cy_cryptohack", kind: "optional" },
  { from_id: "cy_cryptohack", to_id: "cy_nptel_foundations_crypto", kind: "required" },
  { from_id: "cy_nptel_foundations_crypto", to_id: "cy_nptel_network_security", kind: "alternative" },
  { from_id: "cy_cryptohack", to_id: "cy_python_security_books", kind: "optional" },
  { from_id: "cy_nptel_foundations_crypto", to_id: "cy_python_security_books", kind: "optional" },
  { from_id: "cy_networkchuck", to_id: "cy_portswigger", kind: "optional" },
  { from_id: "cy_bitten_tech", to_id: "cy_ctflearn", kind: "optional" },
  { from_id: "cy_john_hammond", to_id: "cy_ctflearn", kind: "optional" },
  { from_id: "cy_nfsu_study", to_id: "cy_tryhackme", kind: "optional" },
  { from_id: "cy_nfsu_study", to_id: "cy_cryptohack", kind: "optional" },

  // DSA — free trio feeds the paid book
  { from_id: "dsa_striver", to_id: "dsa_leetcode_codeforces", kind: "required" },
  { from_id: "dsa_neetcode_150", to_id: "dsa_leetcode_codeforces", kind: "required" },
  { from_id: "dsa_striver", to_id: "dsa_neetcode_150", kind: "alternative" },
  { from_id: "dsa_leetcode_codeforces", to_id: "dsa_karumahchi", kind: "optional" },

  // Blockchain & web3 — free channels → HackQuest → MIT OCW → paid cohorts
  { from_id: "bc_patrick_collins", to_id: "bc_hackquest", kind: "required" },
  { from_id: "bc_daulat_hussain", to_id: "bc_hackquest", kind: "required" },
  { from_id: "bc_patrick_collins", to_id: "bc_daulat_hussain", kind: "alternative" },
  { from_id: "bc_hackquest", to_id: "bc_mit_ocw", kind: "required" },
  { from_id: "bc_mit_ocw", to_id: "bc_harkirat_cohort", kind: "optional" },
  { from_id: "bc_harkirat_cohort", to_id: "bc_udemy_solidity", kind: "optional" },

  // Embedded — Arduino → STM32 → register level → serial / RTOS
  { from_id: "em_arduino_beginners", to_id: "em_stm32_boards", kind: "required" },
  { from_id: "em_stm32_boards", to_id: "em_cortex_m3_book", kind: "required" },
  { from_id: "em_stm32_boards", to_id: "em_stm32_register", kind: "required" },
  { from_id: "em_stm32_register", to_id: "em_rtos_beginners", kind: "alternative" },
  { from_id: "em_stm32_register", to_id: "em_serial_communication", kind: "required" },
  { from_id: "em_rtos_beginners", to_id: "em_microelectric_circuits", kind: "optional" },
  { from_id: "em_serial_communication", to_id: "em_art_of_electronics", kind: "optional" },
];

// ---------------------------------------------------------------------------
// RESOURCES — verbatim from the source.
//   minutes: omitted on purpose wherever the source gave no time estimate,
//   so the catalog never invents a duration.
//   url: null wherever the source gave a title/book with no link.
// ---------------------------------------------------------------------------
const RESOURCES = [
  // --- Cybersecurity ---
  { id: "res_cy_awesome_cyber_security", title: "Awesome Cyber Security — Full List of curated resources", domain: "cybersecurity", kind: "doc", level: "foundation", url: "https://github.com/okhosting/awesome-cyber-security" },
  // res_tryhackme + res_portswigger already exist from seed-content.js; the
  // source lists them too, so they are re-asserted with the source's exact title.
  { id: "res_tryhackme", title: "TryHackMe", domain: "cybersecurity", kind: "course", level: "foundation", url: "https://tryhackme.com/" },
  { id: "res_cy_overthewire", title: "OverTheWire wargames", domain: "cybersecurity", kind: "course", level: "foundation", url: "https://overthewire.org/wargames/" },
  { id: "res_cy_pwn_college", title: "pwn.college", domain: "cybersecurity", kind: "course", level: "foundation_plus", url: "https://pwn.college/" },
  { id: "res_portswigger", title: "PortSwigger Web Security", domain: "cybersecurity", kind: "course", level: "foundation_plus", url: "https://portswigger.net/web-security" },
  { id: "res_cy_ctflearn", title: "CTFlearn", domain: "cybersecurity", kind: "course", level: "foundation", url: "https://ctflearn.com/" },
  { id: "res_cy_cylab_academy", title: "CYLAB Academy — formerly known as picoCTF", domain: "cybersecurity", kind: "course", level: "foundation", url: "https://cylabacademy.org/" },
  { id: "res_cy_cryptohack", title: "CryptoHack — learning cryptography", domain: "cybersecurity", kind: "course", level: "foundation_plus", url: "https://cryptohack.org/" },
  { id: "res_cy_linux_playlist", title: "To start with Linux", domain: "cybersecurity", kind: "video", level: "foundation", url: "https://youtube.com/playlist?list=PLIhvC56v63IJIujb5cyE13oLuyORZpdkL&si=POWXCNjWwxKb039r" },
  { id: "res_cy_nptel_foundations_crypto", title: "Foundations of Cryptography — IIIT Bangalore, Prof. Ashish Choudhury", domain: "cybersecurity", kind: "course", level: "foundation_plus", url: "https://onlinecourses.nptel.ac.in/e-learning/course/noc26_cs18" },
  { id: "res_cy_nptel_network_security", title: "Network Security — Prof. Gaurav S. Kasbekar", domain: "cybersecurity", kind: "course", level: "foundation_plus", url: "https://onlinecourses.nptel.ac.in/e-learning/preview/noc26_ee20" },
  { id: "res_cy_networkchuck", title: "NetworkChuck — to learn about latest tech", domain: "cybersecurity", kind: "video", level: "foundation", url: "https://www.youtube.com/@NetworkChuck" },
  { id: "res_cy_bitten_tech", title: "Bitten Tech — to learn about CTFs", domain: "cybersecurity", kind: "video", level: "foundation", url: "https://www.youtube.com/@BittenTech" },
  { id: "res_cy_john_hammond", title: "John Hammond — to learn about CTFs", domain: "cybersecurity", kind: "video", level: "foundation", url: "https://www.youtube.com/@_JohnHammond" },
  { id: "res_cy_nfsu_study_material", title: "NFSU CyberSecurity Study Material — self study", domain: "cybersecurity", kind: "doc", level: "foundation_plus", url: "https://github.com/Rasenkai/NFSU_CyberSecurity_StudyMaterial" },
  { id: "res_cy_python_security_books", title: "Python for Penetration Testing & Cybersecurity — books", domain: "cybersecurity", kind: "doc", level: "foundation_plus", url: "https://github.com/ManhNho/Python-Books-for-Security/tree/master" },

  // --- DSA ---
  { id: "res_dsa_striver_a2z", title: "Striver's A2Z sheet — DSA A to Z", domain: "dsa", kind: "course", level: "foundation", url: "https://takeuforward.org/dsa/strivers-a2z-sheet-learn-dsa-a-to-z" },
  { id: "res_dsa_neetcode_150", title: "Neetcode 150 — for practice", domain: "dsa", kind: "course", level: "foundation", url: "https://neetcode.io/practice/practice/neetcode150" },
  { id: "res_dsa_leetcode_codeforces", title: "LeetCode and Codeforces editorial", domain: "dsa", kind: "article", level: "foundation_plus", url: null },
  { id: "res_dsa_karumahchi", title: "Data Structures and Algorithms made easy — Narsimha Karumahchi", domain: "dsa", kind: "doc", level: "foundation_plus", url: null },

  // --- Blockchain & web3 ---
  { id: "res_bc_patrick_collins", title: "Patrick Collins", domain: "blockchain", kind: "video", level: "foundation", url: "https://youtube.com/@patrickalphac" },
  { id: "res_bc_daulat_hussain", title: "Daulat Hussain", domain: "blockchain", kind: "video", level: "foundation", url: "https://youtube.com/@daulathussain" },
  { id: "res_bc_hackquest", title: "Web3 programming for everyone — HackQuest", domain: "blockchain", kind: "course", level: "foundation", url: "https://share.google/VmJAaKIAPNldZhs4g" },
  { id: "res_bc_mit_ocw", title: "MIT OpenCourseWare", domain: "blockchain", kind: "doc", level: "foundation_plus", url: null },
  { id: "res_bc_harkirat_100xdevs", title: "Harkirat web3 cohort — 100xDevs", domain: "blockchain", kind: "course", level: "foundation_plus", url: "https://share.google/LGUpFbf56il9AL3Dv" },
  { id: "res_bc_udemy_solidity", title: "Master Solidity — TOON Macharis (Udemy)", domain: "blockchain", kind: "course", level: "foundation_plus", url: "https://www.udemy.com/share/10bwLp/" },

  // --- Embedded systems ---
  { id: "res_em_arduino_beginners", title: "Arduino course for beginners", domain: "embedded", kind: "video", level: "foundation", url: "https://www.youtube.com/watch?v=DPqiIzK97K0" },
  { id: "res_em_stm32_boards", title: "Starting out with STM32 dev boards", domain: "embedded", kind: "video", level: "foundation", url: "https://www.youtube.com/watch?v=dnfuNT1dPiM" },
  { id: "res_em_cortex_m3_book", title: "The definite guide to ARM Cortex M3 — book", domain: "embedded", kind: "doc", level: "foundation_plus", url: null },
  { id: "res_em_stm32_register", title: "STM32 (ARM Cortex) Register Level Programming", domain: "embedded", kind: "video", level: "foundation_plus", url: "https://www.youtube.com/watch?v=GJ_LFAlOlSk&list=PLfIJKC1ud8ghc4eFhI84z_3p3Ap2MCMV-" },
  { id: "res_em_rtos_beginners", title: "RTOS for beginners", domain: "embedded", kind: "video", level: "foundation_plus", url: "https://www.youtube.com/results?search_query=rtos+stm32" },
  { id: "res_em_serial_communication", title: "Fundamentals of serial communication", domain: "embedded", kind: "video", level: "foundation", url: "https://www.youtube.com/watch?v=yz7h5xd18OE" },
  { id: "res_em_microelectric_circuits", title: "Microelectric Circuits: Analysis and Design — Muhammad H. Rashid", domain: "embedded", kind: "doc", level: "foundation_plus", url: null },
  { id: "res_em_art_of_electronics", title: "The Art of Electronics 3rd Edition (2015)", domain: "embedded", kind: "doc", level: "foundation_plus", url: null },
];

try {
  let nodes = 0;
  for (const n of NODES) {
    await sql`
      INSERT INTO roadmap_nodes
        (id, title, description, domain, sort_order, kind, is_highlighted, is_optional, difficulty_level)
      VALUES
        (${n.id}, ${n.title}, ${n.description}, ${n.domain}, ${n.sort_order},
         ${n.kind || "topic"}, ${n.is_highlighted ?? false}, ${n.is_optional ?? false}, 'beginner')
      ON CONFLICT (id) DO UPDATE SET
        title        = EXCLUDED.title,
        description  = EXCLUDED.description,
        domain       = EXCLUDED.domain,
        sort_order   = EXCLUDED.sort_order,
        kind         = EXCLUDED.kind,
        is_highlighted = EXCLUDED.is_highlighted,
        is_optional  = EXCLUDED.is_optional
    `;
    nodes++;
  }
  console.log(`Upserted ${nodes} roadmap nodes (cybersecurity, dsa, blockchain, embedded)`);

  let edges = 0;
  for (const e of EDGES) {
    await sql`
      INSERT INTO roadmap_edges (from_id, to_id, kind)
      VALUES (${e.from_id}, ${e.to_id}, ${e.kind || "required"})
      ON CONFLICT (from_id, to_id) DO UPDATE SET kind = EXCLUDED.kind
    `;
    edges++;
  }
  console.log(`Upserted ${edges} roadmap edges`);

  let res = 0;
  for (const r of RESOURCES) {
    // minutes intentionally not written: the source gave no durations, so the
    // column keeps its default rather than showing an invented time.
    await sql`
      INSERT INTO resources (id, title, domain, kind, level, url)
      VALUES (${r.id}, ${r.title}, ${r.domain}, ${r.kind}, ${r.level}, ${r.url ?? null})
      ON CONFLICT (id) DO UPDATE SET
        title   = EXCLUDED.title,
        domain  = EXCLUDED.domain,
        kind    = EXCLUDED.kind,
        level   = EXCLUDED.level,
        url     = EXCLUDED.url
    `;
    res++;
  }
  console.log(`Upserted ${res} curated resources`);

  const byDomain = await sql`
    SELECT domain, COUNT(*)::int AS n
    FROM roadmap_nodes
    WHERE id LIKE ANY (${["cy_%", "dsa_%", "bc_%", "em_%"]})
    GROUP BY domain ORDER BY domain
  `;
  console.log("nodes per domain:", byDomain.map((r) => `${r.domain}=${r.n}`).join(", "));

  console.log("done. All titles/URLs transcribed from the supplied source text.");
} catch (e) {
  console.error("seed-roadmap-domains failed:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}