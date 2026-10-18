// One-off, precise fix for the single lossy character in docs/15.
//
// U+FFFD means the original bytes were discarded, so no round trip can recover
// it and no tool should guess. This was resolved by reading the surrounding
// prose: line 134 uses the same construction ("Email sending is not wired --
// invites/notifications are in-app only..."), so an em dash is what belongs
// between the host-setting clause and the NEXT_PUBLIC_APP_URL clause.
import fs from "node:fs";

const file = "docs/15-deploy-and-operations.md";
const lines = fs.readFileSync(file, "utf8").split("\n");
let changed = 0;

for (let i = 0; i < lines.length; i += 1) {
  if (!lines[i].includes("\uFFFD")) continue;
  const before = lines[i];
  lines[i] = lines[i].replace(/\uFFFD/g, "\u2014");
  console.log("L" + (i + 1) + " fixed: " + before.trim().slice(0, 70) + "...");
  console.log("         ->     " + lines[i].trim().slice(0, 70) + "...");
  changed += 1;
}

if (changed !== 1) {
  console.error("expected exactly one lossy character, found " + changed + " -- aborting");
  process.exit(1);
}

fs.writeFileSync(file, lines.join("\n"), "utf8");
console.log("done");