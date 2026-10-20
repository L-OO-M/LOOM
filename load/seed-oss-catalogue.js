// Seed the global open-source catalogue with repos across every LOOM domain.
//
// The original seed had six repos, five of them `web`, so "matches your domain"
// had nothing to match. This is still a curated list, not a live index: stars
// and good-first-issue counts stay at their stored values until
// `node load/sync-oss-repos.js --apply` refreshes them from GitHub.
//
// Usage:
//   node load/seed-oss-catalogue.js             # dry run
//   node load/seed-oss-catalogue.js --apply
import postgres from "postgres";
import { databaseUrl } from "./env-local.js";

const apply = process.argv.includes("--apply");

// owner, repo, domain, difficulty, language, description
const CATALOGUE = [
  // web
  ["firstcontributions", "first-contributions", "web", "beginner", "JavaScript", "A guided first pull request for people who have never contributed to open source."],
  ["freeCodeCamp", "freeCodeCamp", "web", "beginner", "TypeScript", "The open-source curriculum and codebase behind freeCodeCamp.org."],
  ["vercel", "next.js", "web", "intermediate", "JavaScript", "The React framework for production web applications."],
  ["facebook", "react", "web", "intermediate", "JavaScript", "A JavaScript library for building user interfaces."],
  ["vuejs", "core", "web", "intermediate", "TypeScript", "The progressive JavaScript framework."],
  ["sveltejs", "svelte", "web", "intermediate", "JavaScript", "Cybernetically enhanced web apps."],
  ["withastro", "astro", "web", "intermediate", "TypeScript", "The web framework for content-driven websites."],
  ["tailwindlabs", "tailwindcss", "web", "advanced", "TypeScript", "A utility-first CSS framework."],
  // ai_ml
  ["openai", "openai-cookbook", "ai_ml", "beginner", "Jupyter Notebook", "Examples and guides for building with the OpenAI API."],
  ["scikit-learn", "scikit-learn", "ai_ml", "intermediate", "Python", "Machine learning in Python."],
  ["huggingface", "transformers", "ai_ml", "advanced", "Python", "State-of-the-art machine learning models for text, vision and audio."],
  ["tensorflow", "tensorflow", "ai_ml", "advanced", "C++", "An end-to-end open-source machine learning platform."],
  ["pytorch", "pytorch", "ai_ml", "advanced", "Python", "Tensors and dynamic neural networks in Python."],
  ["ollama", "ollama", "ai_ml", "intermediate", "Go", "Run large language models locally."],
  ["langchain-ai", "langchain", "ai_ml", "intermediate", "Python", "Build applications powered by large language models."],
  // cybersecurity
  ["OWASP", "wstg", "cybersecurity", "beginner", "Markdown", "The Web Security Testing Guide."],
  ["OWASP", "owasp-mastg", "cybersecurity", "intermediate", "Python", "The Mobile Application Security Testing Guide."],
  ["projectdiscovery", "nuclei", "cybersecurity", "intermediate", "Go", "Fast, template-based vulnerability scanning."],
  ["bridgecrewio", "checkov", "cybersecurity", "intermediate", "Python", "Static analysis for infrastructure as code."],
  ["mitmproxy", "mitmproxy", "cybersecurity", "advanced", "Python", "An interactive TLS-capable intercepting proxy."],
  // dsa
  ["TheAlgorithms", "Python", "dsa", "beginner", "Python", "All algorithms implemented in Python, for learning."],
  ["TheAlgorithms", "JavaScript", "dsa", "beginner", "JavaScript", "All algorithms implemented in JavaScript."],
  ["cp-algorithms", "cp-algorithms", "dsa", "intermediate", "C++", "Descriptions and implementations of competitive programming algorithms."],
  ["neetcode-gh", "leetcode", "dsa", "beginner", "JavaScript", "Clean solutions to common interview problems."],
  // blockchain
  ["OpenZeppelin", "openzeppelin-contracts", "blockchain", "intermediate", "Solidity", "Secure smart contract libraries for Ethereum."],
  ["foundry-rs", "foundry", "blockchain", "advanced", "Rust", "A fast, portable toolkit for Ethereum development."],
  ["ethereum", "go-ethereum", "blockchain", "advanced", "Go", "The official Go implementation of the Ethereum protocol."],
  ["solana-labs", "solana", "blockchain", "advanced", "Rust", "Web-scale blockchain for fast, cheap transactions."],
  // embedded
  ["arduino", "Arduino", "embedded", "beginner", "C++", "The Arduino IDE and core libraries."],
  ["espressif", "arduino-esp32", "embedded", "intermediate", "C++", "Arduino core for the ESP32 family."],
  ["PlatformIO", "platformio-core", "embedded", "intermediate", "Python", "A cross-platform build system for embedded development."],
  ["micropython", "micropython", "embedded", "advanced", "C", "Python for microcontrollers."],
  // backend
  ["fastapi", "fastapi", "backend", "intermediate", "Python", "A modern, fast web framework for building APIs with Python."],
  ["gofiber", "fiber", "backend", "beginner", "Go", "An Express-inspired web framework for Go."],
  ["supabase", "supabase", "backend", "advanced", "TypeScript", "The open-source Firebase alternative."],
  ["nodejs", "node", "backend", "advanced", "JavaScript", "The Node.js JavaScript runtime."],
  // devops
  ["docker", "compose", "devops", "beginner", "Go", "Define and run multi-container applications with Docker."],
  ["ansible", "ansible", "devops", "intermediate", "Python", "IT automation for configuration and deployment."],
  ["grafana", "grafana", "devops", "intermediate", "TypeScript", "The open observability platform."],
  ["kubernetes", "kubernetes", "devops", "advanced", "Go", "Production-grade container orchestration."]
];

const sql = postgres(databaseUrl(), { max: 1, prepare: false });

try {
  console.log(`OSS CATALOGUE ${apply ? "(applying)" : "(dry run - pass --apply to write)"} | ${CATALOGUE.length} repos`);
  let written = 0;
  for (const [owner, repo, domain, difficulty, language, description] of CATALOGUE) {
    const url = `https://github.com/${owner}/${repo}`;
    if (!apply) {
      console.log(`- ${owner}/${repo} | ${domain} | ${difficulty}`);
      continue;
    }
    const [existing] = await sql`
      SELECT id FROM open_source_projects
      WHERE lower(owner || '/' || repo_name) = lower(${`${owner}/${repo}`})
      LIMIT 1
    `;
    if (existing) {
      await sql`
        UPDATE open_source_projects SET
          owner = ${owner},
          repo_name = ${repo},
          github_repo_url = ${url},
          description = ${description},
          difficulty = ${difficulty},
          primary_domain = ${domain},
          language = ${language},
          is_curated = true,
          is_active = true
        WHERE id = ${existing.id}
      `;
    } else {
      await sql`
        INSERT INTO open_source_projects
          (tenant_id, github_repo_url, owner, repo_name, description, difficulty,
           primary_domain, language, is_curated, created_by)
        VALUES (NULL, ${url}, ${owner}, ${repo}, ${description}, ${difficulty},
          ${domain}, ${language}, true, 'seed-oss-catalogue')
      `;
    }
    written += 1;
  }
  if (apply) console.log(`Seeded ${written} repositories. Run sync-oss-repos.js --apply to refresh metadata.`);
} finally {
  await sql.end();
}
