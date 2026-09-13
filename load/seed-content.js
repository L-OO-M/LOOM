import postgres from "postgres";

const DATABASE_URL = "postgresql://postgres.gbkpocjtcnozihvacmtg:LOOMLOBBY1234@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres";

const sql = postgres(DATABASE_URL, { max: 1 });

try {
  const nodes = [
    { id: "node_html_css", title: "HTML and CSS foundations", description: "Build accessible page structure and responsive layouts.", domain: "web", sort_order: 1 },
    { id: "node_javascript", title: "JavaScript fundamentals", description: "Use state, events, modules, and browser APIs with confidence.", domain: "web", sort_order: 2 },
    { id: "node_git_github", title: "Git and GitHub workflow", description: "Create branches, pull requests, reviews, and clean commits.", domain: "web", sort_order: 3 },
    { id: "node_react", title: "React product UI", description: "Build component state, effects, forms, and optimistic feedback.", domain: "web", sort_order: 4 },
    { id: "node_node", title: "Node and API design", description: "Create route handlers, validation, authorization, and jobs.", domain: "backend", sort_order: 5 },
    { id: "node_database", title: "Database and persistence", description: "Design schemas, queries, migrations, and connection pooling.", domain: "backend", sort_order: 6 },
    { id: "node_deploy", title: "Deployment and operations", description: "Ship services, monitor, handle errors, and manage infrastructure.", domain: "devops", sort_order: 7 }
  ];

  for (const node of nodes) {
    await sql`
      INSERT INTO roadmap_nodes (id, title, description, domain, sort_order)
      VALUES (${node.id}, ${node.title}, ${node.description}, ${node.domain}, ${node.sort_order})
      ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order
    `;
  }
  console.log(`Seeded ${nodes.length} roadmap nodes`);

  // Curated society catalog across the five focus domains. Every URL is a
  // well-known stable source (docs, free courses, practice platforms).
  const resources = [
    // AI / ML — ML fundamentals, paper reading, dataset contests, applied projects
    { id: "res_ml_crash", title: "Machine Learning Crash Course", domain: "ai_ml", kind: "course", level: "foundation", minutes: 600, url: "https://developers.google.com/machine-learning/crash-course" },
    { id: "res_hf_nlp", title: "Hugging Face NLP Course", domain: "ai_ml", kind: "course", level: "foundation_plus", minutes: 480, url: "https://huggingface.co/learn/nlp-course" },
    { id: "res_fastai", title: "Practical Deep Learning (fast.ai)", domain: "ai_ml", kind: "course", level: "foundation_plus", minutes: 600, url: "https://course.fast.ai/" },
    { id: "res_kaggle_intro", title: "Kaggle Learn: Intro to Machine Learning", domain: "ai_ml", kind: "course", level: "foundation", minutes: 240, url: "https://www.kaggle.com/learn/intro-to-machine-learning" },
    { id: "res_distill", title: "Distill: ML research, visually explained", domain: "ai_ml", kind: "article", level: "foundation_plus", minutes: 45, url: "https://distill.pub/" },
    // Web Development — bootcamps, frameworks, society site, Git & deployment
    { id: "res_html_semantic", title: "Semantic HTML structure", domain: "web", kind: "doc", level: "foundation", minutes: 25, url: "https://developer.mozilla.org/docs/Web/HTML" },
    { id: "res_css_grid", title: "CSS Grid layout patterns", domain: "web", kind: "doc", level: "foundation", minutes: 30, url: "https://css-tricks.com/snippets/css/complete-guide-grid/" },
    { id: "res_fcc_responsive", title: "Responsive Web Design Certification", domain: "web", kind: "course", level: "foundation", minutes: 600, url: "https://www.freecodecamp.org/learn/2022/responsive-web-design/" },
    { id: "res_js_info", title: "The Modern JavaScript Tutorial", domain: "web", kind: "doc", level: "foundation", minutes: 480, url: "https://javascript.info/" },
    { id: "res_js_async", title: "Async JavaScript patterns", domain: "web", kind: "doc", level: "foundation_plus", minutes: 35, url: "https://developer.mozilla.org/docs/Learn/JavaScript/Asynchronous" },
    { id: "res_webdev_learn", title: "web.dev Learn: modern web fundamentals", domain: "web", kind: "doc", level: "foundation_plus", minutes: 120, url: "https://web.dev/learn" },
    { id: "res_git_branching", title: "Git branching strategies", domain: "web", kind: "doc", level: "foundation", minutes: 20, url: "https://learngitbranching.js.org/" },
    { id: "res_react_hooks", title: "React Hooks deep dive", domain: "web", kind: "doc", level: "foundation_plus", minutes: 40, url: "https://react.dev/reference/react" },
    // Cybersecurity — ethical hacking within legal boundaries, CTFs, crypto, secure coding
    { id: "res_owasp_top10", title: "OWASP Top 10", domain: "cybersecurity", kind: "doc", level: "foundation", minutes: 90, url: "https://owasp.org/www-project-top-ten/" },
    { id: "res_portswigger", title: "PortSwigger Web Security Academy", domain: "cybersecurity", kind: "course", level: "foundation_plus", minutes: 600, url: "https://portswigger.net/web-security" },
    { id: "res_tryhackme", title: "TryHackMe Pre-Security Path", domain: "cybersecurity", kind: "course", level: "foundation", minutes: 480, url: "https://tryhackme.com/" },
    { id: "res_ctftime", title: "CTFtime: find your first CTF", domain: "cybersecurity", kind: "article", level: "foundation", minutes: 30, url: "https://ctftime.org/" },
    // DSA — weekly problem-solving, contests, interviews, mocks
    { id: "res_neetcode", title: "NeetCode Roadmap", domain: "dsa", kind: "course", level: "foundation", minutes: 600, url: "https://neetcode.io/" },
    { id: "res_cp_algo", title: "CP-Algorithms", domain: "dsa", kind: "doc", level: "foundation_plus", minutes: 480, url: "https://cp-algorithms.com/" },
    { id: "res_visualgo", title: "VisuAlgo: see data structures work", domain: "dsa", kind: "article", level: "foundation", minutes: 60, url: "https://visualgo.net/" },
    { id: "res_big_o", title: "Big-O Cheat Sheet", domain: "dsa", kind: "doc", level: "foundation", minutes: 20, url: "https://www.bigocheatsheet.com/" },
    { id: "res_leetcode", title: "LeetCode problem sets", domain: "dsa", kind: "article", level: "foundation_plus", minutes: 30, url: "https://leetcode.com/" },
    // Blockchain — distributed ledgers, smart contracts, Web3 mini-projects
    { id: "res_eth_dev", title: "Ethereum Development Docs", domain: "blockchain", kind: "doc", level: "foundation", minutes: 180, url: "https://ethereum.org/en/developers/" },
    { id: "res_cryptozombies", title: "CryptoZombies: learn Solidity by building", domain: "blockchain", kind: "course", level: "foundation", minutes: 360, url: "https://cryptozombies.io/" },
    { id: "res_solidity_docs", title: "Solidity Language Documentation", domain: "blockchain", kind: "doc", level: "foundation_plus", minutes: 240, url: "https://docs.soliditylang.org/" },
    { id: "res_btc_dev", title: "Bitcoin Developer Guide", domain: "blockchain", kind: "doc", level: "foundation_plus", minutes: 180, url: "https://developer.bitcoin.org/" },
    // Platform engineering (existing catalog, kept)
    { id: "res_node_express", title: "Express route design", domain: "backend", kind: "article", level: "foundation", minutes: 30 },
    { id: "res_db_drizzle", title: "Drizzle ORM schema design", domain: "backend", kind: "article", level: "foundation_plus", minutes: 35 },
    { id: "res_deploy_railway", title: "Deploy to production", domain: "devops", kind: "article", level: "foundation", minutes: 25 }
  ];

  for (const resource of resources) {
    await sql`
      INSERT INTO resources (id, title, domain, kind, level, minutes, url)
      VALUES (${resource.id}, ${resource.title}, ${resource.domain}, ${resource.kind}, ${resource.level}, ${resource.minutes}, ${resource.url ?? null})
      ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, domain = EXCLUDED.domain, kind = EXCLUDED.kind, level = EXCLUDED.level, minutes = EXCLUDED.minutes, url = EXCLUDED.url
    `;
  }
  console.log(`Seeded ${resources.length} resources`);
} catch (e) {
  console.error("Seed failed:", e.message);
} finally {
  await sql.end();
}
