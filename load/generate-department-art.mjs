// Generates the department cover art in public/departments/.
//
// Run once after changing the catalogue, then commit the PNGs:
//   node load/generate-department-art.mjs
//
// The art is generated rather than hand-uploaded so every department gets the
// same composition language (dark ink, accent glow, one geometric motif, the
// same type scale). Rasters are committed because the app serves them as plain
// images and CI should not need a native image toolchain to build.
//
// sharp is already present as a Next.js dependency; if it is missing this script
// says so instead of failing with a stack trace.
import fs from "node:fs/promises";
import path from "node:path";
import { DEPARTMENT_CATALOG } from "../lib/department-catalog.js";

const OUT_DIR = path.join(process.cwd(), "public", "departments");
const W = 1600;
const H = 1000;

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function motif(slug, accent) {
  const a = accent;
  const soft = `${a}55`;
  const faint = `${a}22`;
  const white = "#F8FAFC";

  switch (slug) {
    case "ai_ml":
      return `
        <g stroke="${soft}" stroke-width="2">
          ${[
            [880, 360, 1040, 300], [880, 360, 1040, 500], [880, 360, 1040, 660],
            [1040, 300, 1200, 400], [1040, 300, 1200, 560],
            [1040, 500, 1200, 400], [1040, 500, 1200, 560], [1040, 500, 1200, 720],
            [1040, 660, 1200, 560], [1040, 660, 1200, 720]
          ].map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`).join("")}
        </g>
        ${[
          [880, 360, 22], [1040, 300, 16], [1040, 500, 20], [1040, 660, 16],
          [1200, 400, 15], [1200, 560, 26], [1200, 720, 14]
        ].map(([x, y, r], i) => `
          <circle cx="${x}" cy="${y}" r="${r}" fill="${i === 5 ? a : "#12161F"}" stroke="${i === 5 ? a : soft}" stroke-width="2" />
        `).join("")}
        <circle cx="1200" cy="560" r="54" fill="none" stroke="${a}" stroke-opacity="0.45" stroke-width="1.5" stroke-dasharray="4 8" />
        <circle cx="880" cy="360" r="200" fill="none" stroke="${faint}" stroke-width="1" />
      `;

    case "web":
      return `
        ${[
          [860, 300, "#151A23"], [930, 370, "#171D27"], [1000, 440, "#1A212C"]
        ].map(([x, y, fill], i) => `
          <g>
            <rect x="${x}" y="${y}" width="520" height="330" rx="18" fill="${fill}" stroke="${i === 2 ? a : soft}" stroke-width="${i === 2 ? 2 : 1.5}" />
            <line x1="${x}" y1="${y + 46}" x2="${x + 520}" y2="${y + 46}" stroke="${soft}" stroke-width="1.5" />
            ${[0, 1, 2].map((d) => `<circle cx="${x + 28 + d * 20}" cy="${y + 24}" r="5" fill="${d === 0 ? a : "#3A4354"}" />`).join("")}
            ${i === 2 ? `
              <rect x="${x + 30}" y="${y + 78}" width="210" height="14" rx="7" fill="${a}" fill-opacity="0.85" />
              <rect x="${x + 30}" y="${y + 112}" width="330" height="10" rx="5" fill="#2C3441" />
              <rect x="${x + 30}" y="${y + 138}" width="270" height="10" rx="5" fill="#2C3441" />
              <rect x="${x + 30}" y="${y + 196}" width="460" height="92" rx="12" fill="#0C1017" stroke="${faint}" />
              <path d="M ${x + 54} ${y + 236} l 42 0 m -18 -18 l 18 18 l -18 18" stroke="${a}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" />
              <rect x="${x + 120}" y="${y + 226}" width="240" height="10" rx="5" fill="#2C3441" />
              <rect x="${x + 120}" y="${y + 248}" width="160" height="10" rx="5" fill="#2C3441" />
            ` : ""}
          </g>
        `).join("")}
      `;

    case "cybersecurity":
      return `
        ${[220, 300, 380].map((r, i) => `
          <path d="M 1180 ${500 - r} L ${1180 + r * 0.87} ${500 - r / 2} L ${1180 + r * 0.87} ${500 + r / 2} L 1180 ${500 + r} L ${1180 - r * 0.87} ${500 + r / 2} L ${1180 - r * 0.87} ${500 - r / 2} Z"
                fill="none" stroke="${i === 0 ? a : faint}" stroke-width="${i === 0 ? 2.5 : 1}" />
        `).join("")}
        <path d="M 1180 330 C 1260 360 1300 370 1300 430 L 1300 530 C 1300 620 1240 680 1180 706 C 1120 680 1060 620 1060 530 L 1060 430 C 1060 370 1100 360 1180 330 Z"
              fill="#12161F" stroke="${a}" stroke-width="3" />
        <circle cx="1180" cy="490" r="34" fill="none" stroke="${a}" stroke-width="3" />
        <rect x="1168" y="512" width="24" height="66" rx="8" fill="${a}" />
        <line x1="960" y1="760" x2="1400" y2="760" stroke="${faint}" stroke-width="1" />
        ${[0, 1, 2, 3].map((i) => `<line x1="${988 + i * 100}" y1="760" x2="${972 + i * 100}" y2="792" stroke="${faint}" stroke-width="1" />`).join("")}
      `;

    case "dsa":
      return `
        <g stroke="${soft}" stroke-width="2">
          <line x1="1120" y1="300" x2="1000" y2="430" /><line x1="1120" y1="300" x2="1240" y2="430" />
          <line x1="1000" y1="430" x2="920" y2="560" /><line x1="1000" y1="430" x2="1080" y2="560" />
          <line x1="1240" y1="430" x2="1160" y2="560" /><line x1="1240" y1="430" x2="1320" y2="560" />
        </g>
        ${[[1120, 300, 26], [1000, 430, 20], [1240, 430, 20], [920, 560, 16], [1080, 560, 16], [1160, 560, 16], [1320, 560, 16]]
          .map(([x, y, r], i) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${i === 0 ? a : "#12161F"}" stroke="${i === 0 ? a : soft}" stroke-width="2" />`).join("")}
        ${[70, 120, 170, 220, 270].map((h, i) => `
          <rect x="${905 + i * 58}" y="${790 - h}" width="34" height="${h}" rx="6" fill="${a}" fill-opacity="${0.18 + i * 0.12}" />
        `).join("")}
        <line x1="890" y1="792" x2="1230" y2="792" stroke="${soft}" stroke-width="2" />
      `;

    case "blockchain": {
      const cube = (x, y, r) => `
        <g stroke="${a}" stroke-width="2.5" fill="#12161F">
          <path d="M ${x} ${y - r} L ${x + r} ${y - r / 2} L ${x} ${y} L ${x - r} ${y - r / 2} Z" fill="${a}22" />
          <path d="M ${x - r} ${y - r / 2} L ${x} ${y} L ${x} ${y + r} L ${x - r} ${y + r / 2} Z" />
          <path d="M ${x + r} ${y - r / 2} L ${x} ${y} L ${x} ${y + r} L ${x + r} ${y + r / 2} Z" />
        </g>`;
      return `
        <line x1="960" y1="540" x2="1120" y2="540" stroke="${soft}" stroke-width="3" stroke-dasharray="10 10" />
        <line x1="1240" y1="540" x2="1400" y2="540" stroke="${soft}" stroke-width="3" stroke-dasharray="10 10" />
        ${cube(920, 520, 90)}
        ${cube(1120, 520, 110)}
        ${cube(1320, 520, 90)}
        <circle cx="1040" cy="540" r="8" fill="${a}" />
        <circle cx="1280" cy="540" r="8" fill="${a}" />
        <circle cx="1120" cy="520" r="230" fill="none" stroke="${faint}" stroke-width="1" />
      `;
    }

    case "embedded":
      return `
        <g stroke="${faint}" stroke-width="3" stroke-linecap="round">
          ${Array.from({ length: 8 }, (_, i) => `
            <path d="M ${960 + i * 60} 760 L ${960 + i * 60} 820 L ${1010 + i * 60} 870" />
            <path d="M ${960 + i * 60} 300 L ${960 + i * 60} 240 L ${1010 + i * 60} 190" />
          `).join("")}
          ${Array.from({ length: 4 }, (_, i) => `
            <path d="M 1000 ${400 + i * 70} L 940 ${400 + i * 70} L 890 ${450 + i * 70}" />
            <path d="M 1400 ${400 + i * 70} L 1460 ${400 + i * 70} L 1510 ${450 + i * 70}" />
          `).join("")}
        </g>
        <rect x="1000" y="300" width="400" height="400" rx="34" fill="#12161F" stroke="${a}" stroke-width="3" />
        <rect x="1052" y="352" width="296" height="296" rx="18" fill="${a}14" stroke="${soft}" stroke-width="2" />
        <rect x="1100" y="400" width="200" height="200" rx="12" fill="none" stroke="${a}" stroke-width="2.5" />
        <circle cx="1200" cy="500" r="42" fill="none" stroke="${a}" stroke-width="2" />
        <circle cx="1200" cy="500" r="10" fill="${a}" />
        ${[
          [1040, 370], [1360, 370], [1040, 630], [1360, 630]
        ].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7" fill="${a}" />`).join("")}
      `;

    case "design":
      return `
        <g opacity="0.9">
          <circle cx="1080" cy="440" r="170" fill="${a}" fill-opacity="0.30" />
          <circle cx="1200" cy="440" r="170" fill="#38BDF8" fill-opacity="0.22" />
          <circle cx="1140" cy="540" r="170" fill="#FB7185" fill-opacity="0.22" />
        </g>
        <g stroke="${white}" stroke-opacity="0.75" stroke-width="2.5" fill="none">
          <path d="M 890 760 C 1000 620 1080 840 1200 690 S 1380 600 1460 700" />
          <circle cx="890" cy="760" r="10" fill="${a}" stroke="none" />
          <circle cx="1460" cy="700" r="10" fill="${a}" stroke="none" />
          <line x1="890" y1="760" x2="960" y2="690" stroke="${soft}" />
          <line x1="890" y1="760" x2="820" y2="830" stroke="${soft}" />
          <circle cx="960" cy="690" r="6" fill="#12161F" />
          <circle cx="820" cy="830" r="6" fill="#12161F" />
        </g>
        <rect x="980" y="220" width="44" height="140" rx="10" transform="rotate(35 1002 290)" fill="${a}" fill-opacity="0.8" />
        <path d="M 1320 300 l 46 46 l -30 30 l -46 -46 Z" fill="#12161F" stroke="${soft}" stroke-width="2" />
      `;

    case "documentation":
      return `
        ${[
          [1040, 320, -6], [980, 360, -2], [920, 400, 2]
        ].map(([x, y, rot], i) => `
          <g transform="rotate(${rot} ${x + 190} ${y + 250})">
            <rect x="${x}" y="${y}" width="380" height="500" rx="14" fill="${i === 2 ? "#171D27" : "#12161F"}" stroke="${i === 2 ? a : soft}" stroke-width="${i === 2 ? 2.5 : 1.5}" />
            <rect x="${x + 36}" y="${y + 48}" width="150" height="16" rx="8" fill="${i === 2 ? a : "#3A4354"}" />
            ${[0, 1, 2, 3, 4, 5, 6].map((l) => `<rect x="${x + 36}" y="${y + 104 + l * 34}" width="${l % 3 === 2 ? 210 : 300}" height="10" rx="5" fill="#2C3441" />`).join("")}
            ${i === 2 ? `<rect x="${x + 300}" y="${y}" width="34" height="90" rx="6" fill="${a}" />` : ""}
          </g>
        `).join("")}
        <line x1="900" y1="880" x2="1420" y2="880" stroke="${faint}" stroke-width="1" />
      `;

    case "smm_content":
      return `
        <rect x="900" y="330" width="340" height="340" rx="40" fill="#12161F" stroke="${a}" stroke-width="3" />
        <path d="M 1030 430 L 1130 500 L 1030 570 Z" fill="${a}" />
        <circle cx="1200" cy="400" r="14" fill="${a}" />
        ${[40, 74, 108, 150, 108, 74, 40].map((h, i) => `
          <rect x="${1290 + i * 26}" y="${500 - h / 2}" width="10" height="${h}" rx="5" fill="${a}" fill-opacity="${0.35 + i * 0.08}" />
        `).join("")}
        <rect x="900" y="716" width="340" height="16" rx="8" fill="#2C3441" />
        <rect x="900" y="716" width="210" height="16" rx="8" fill="${a}" />
        <circle cx="1350" cy="300" r="8" fill="${a}" />
        <circle cx="1390" cy="270" r="5" fill="${a}" fill-opacity="0.6" />
      `;

    case "publicity":
      return `
        <path d="M 940 470 L 1080 380 L 1080 620 L 940 530 Z" fill="${a}" fill-opacity="0.9" />
        <rect x="880" y="462" width="60" height="76" rx="14" fill="#12161F" stroke="${a}" stroke-width="3" />
        <path d="M 900 530 L 940 660 L 1000 646 L 962 530" fill="#12161F" stroke="${a}" stroke-width="3" />
        ${[120, 180, 240].map((r, i) => `
          <path d="M ${1120} ${500 - r} A ${r} ${r} 0 0 1 ${1120} ${500 + r}" fill="none" stroke="${a}" stroke-opacity="${0.75 - i * 0.2}" stroke-width="3" />
        `).join("")}
        ${[[1300, 340], [1350, 430], [1330, 600], [1270, 690]].map(([x, y], i) => `
          <g transform="rotate(${i * 24} ${x} ${y})"><rect x="${x}" y="${y}" width="16" height="16" rx="3" fill="${a}" fill-opacity="${0.5 + i * 0.12}" /></g>
        `).join("")}
      `;

    case "sponsorship":
      return `
        <circle cx="1070" cy="500" r="130" fill="none" stroke="${a}" stroke-width="18" stroke-opacity="0.9" />
        <circle cx="1210" cy="500" r="130" fill="none" stroke="${a}" stroke-width="18" stroke-opacity="0.45" />
        ${[0, 1, 2, 3].map((i) => `
          <rect x="${930 + i * 130}" y="${760 - (i + 1) * 60}" width="70" height="${(i + 1) * 60}" rx="10" fill="${a}" fill-opacity="${0.18 + i * 0.12}" />
        `).join("")}
        <line x1="900" y1="762" x2="1400" y2="762" stroke="${soft}" stroke-width="2" />
        <path d="M 1140 300 l 24 48 l 52 8 l -38 38 l 9 54 l -47 -26 l -47 26 l 9 -54 l -38 -38 l 52 -8 Z" fill="none" stroke="${a}" stroke-opacity="0.5" stroke-width="2" />
      `;

    case "management":
      return `
        ${[0, 1, 2, 3].map((i) => `<line x1="${900 + i * 150}" y1="260" x2="${900 + i * 150}" y2="760" stroke="${faint}" stroke-width="1" />`).join("")}
        ${[
          [900, 300, 330], [1010, 390, 260], [860, 480, 400], [1100, 570, 300]
        ].map(([x, y, w], i) => `
          <rect x="${x}" y="${y}" width="${w}" height="46" rx="12" fill="${a}" fill-opacity="${0.28 + i * 0.14}" stroke="${soft}" stroke-width="1" />
          <circle cx="${x + w}" cy="${y + 23}" r="9" fill="${a}" />
        `).join("")}
        ${[0, 1, 2].map((i) => `
          <g>
            <circle cx="${1220}" cy="${300 + i * 90}" r="18" fill="#12161F" stroke="${a}" stroke-width="2" />
            <path d="M ${1212} ${300 + i * 90} l 6 7 l 12 -16" stroke="${a}" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
            <rect x="1260" y="${292 + i * 90}" width="${180 - i * 30}" height="12" rx="6" fill="#2C3441" />
          </g>
        `).join("")}
        <line x1="880" y1="800" x2="1440" y2="800" stroke="${soft}" stroke-width="2" />
      `;

    case "public_relations":
      return `
        <circle cx="1150" cy="500" r="250" fill="#12161F" stroke="${a}" stroke-width="2.5" />
        <ellipse cx="1150" cy="500" rx="250" ry="96" fill="none" stroke="${soft}" stroke-width="1.5" />
        <ellipse cx="1150" cy="500" rx="96" ry="250" fill="none" stroke="${soft}" stroke-width="1.5" />
        <line x1="900" y1="500" x2="1400" y2="500" stroke="${faint}" stroke-width="1.5" />
        <line x1="1150" y1="250" x2="1150" y2="750" stroke="${faint}" stroke-width="1.5" />
        <ellipse cx="1150" cy="500" rx="360" ry="140" fill="none" stroke="${a}" stroke-opacity="0.55" stroke-width="2" transform="rotate(-24 1150 500)" />
        ${[[850, 400], [1310, 300], [1420, 640], [1000, 760]].map(([x, y], i) => `
          <circle cx="${x}" cy="${y}" r="${10 + i * 2}" fill="${a}" fill-opacity="0.9" />
          <circle cx="${x}" cy="${y}" r="${24 + i * 4}" fill="none" stroke="${a}" stroke-opacity="0.3" stroke-width="1.5" />
        `).join("")}
      `;

    default:
      return `<circle cx="1150" cy="500" r="240" fill="none" stroke="${a}" stroke-width="3" />`;
  }
}

function cover(d) {
  const accent = d.accent;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0A0C11" />
      <stop offset="0.55" stop-color="#0E1118" />
      <stop offset="1" stop-color="#141821" />
    </linearGradient>
    <radialGradient id="glow" cx="0.72" cy="0.38" r="0.62">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.34" />
      <stop offset="0.55" stop-color="${accent}" stop-opacity="0.10" />
      <stop offset="1" stop-color="${accent}" stop-opacity="0" />
    </radialGradient>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#FFFFFF" stroke-opacity="0.035" stroke-width="1" />
    </pattern>
    <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#0A0C11" stop-opacity="0.92" />
      <stop offset="0.55" stop-color="#0A0C11" stop-opacity="0.25" />
      <stop offset="1" stop-color="#0A0C11" stop-opacity="0" />
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)" />
  <rect width="${W}" height="${H}" fill="url(#glow)" />
  <rect width="${W}" height="${H}" fill="url(#grid)" />
  <rect width="${W}" height="${H}" fill="url(#fade)" />

  <g>${motif(d.slug, accent)}</g>

  <g font-family="'Segoe UI', 'Helvetica Neue', Arial, sans-serif">
    <g transform="translate(110 120)">
      <rect width="86" height="86" rx="22" fill="${accent}" fill-opacity="0.14" stroke="${accent}" stroke-width="1.5" />
      <text x="43" y="55" text-anchor="middle" font-size="30" font-weight="700" letter-spacing="1" fill="${accent}">${esc(d.glyph)}</text>
    </g>
    <text x="110" y="292" font-size="17" letter-spacing="7" fill="${accent}" fill-opacity="0.9">LOOM / ${esc(d.vertical === "technical" ? "TECHNICAL" : "NON-TECHNICAL")}</text>
    <text x="110" y="700" font-size="72" font-weight="600" letter-spacing="-1.5" fill="#F8FAFC">${esc(d.name.replace(" & ", " & "))}</text>
    <text x="110" y="756" font-size="26" fill="#F8FAFC" fill-opacity="0.58">${esc(d.tagline)}</text>
    <line x1="110" y1="812" x2="560" y2="812" stroke="${accent}" stroke-width="2" stroke-opacity="0.7" />
    <text x="110" y="864" font-size="15" letter-spacing="5" fill="#F8FAFC" fill-opacity="0.35">/ ${esc(d.slug.replace(/_/g, "-"))}</text>
    <text x="1490" y="880" text-anchor="end" font-size="18" letter-spacing="8" fill="#F8FAFC" fill-opacity="0.3">LOOM</text>
  </g>
</svg>`;
}

let sharp;
try {
  ({ default: sharp } = await import("sharp"));
} catch {
  console.error("sharp is not installed; department art was not regenerated.");
  console.error("The committed PNGs in public/departments/ are still valid.");
  process.exit(1);
}

await fs.mkdir(OUT_DIR, { recursive: true });

for (const d of DEPARTMENT_CATALOG) {
  const svg = cover(d);
  const out = path.join(OUT_DIR, `${d.slug}.png`);
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toFile(out);
  console.log(`wrote ${path.relative(process.cwd(), out)}`);
}

console.log(`\n${DEPARTMENT_CATALOG.length} department covers generated.`);
