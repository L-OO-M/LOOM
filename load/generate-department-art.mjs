// Generates the department cover art in public/departments/.
//
// Run after changing the catalogue, then commit the PNGs:
//   node load/generate-department-art.mjs
//
// The covers belong to the site's existing artwork family (public/domains-art):
// white-ground 3D object renders. They are therefore *derived from those files*
// rather than drawn in a new style, so the light, the grain and the material are
// literally the same render. Each department takes one of the four plates and a
// distinct hue / mirror / placement, and is never cropped - the whole object set
// stays in frame, exactly like the domain plates.
//
// The transform is deterministic: same inputs, byte-identical output. Rasters
// are committed because the app serves them as plain images and CI must not
// need a native image toolchain to build.
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const OUT_DIR = path.join(process.cwd(), "public", "departments");
const SRC_DIR = path.join(process.cwd(), "public", "domains-art");
const SIZE = 816; // same canvas as the domain plates

/**
 * slug, plate, hue, saturation, scale, mirror.
 *
 * `scale` shrinks the plate inside the canvas (never enlarges it, so nothing is
 * cut off) and every plate stays centred, exactly like the domain originals.
 * Departments sharing a plate differ in hue, mirror and zoom, so the grid never
 * shows the same picture twice.
 */
const PLATES = [
  ["ai_ml",            "domain-ai.png",         0, 1.00, 1.00, false],
  ["web",              "domain-web.png",        0, 1.00, 1.00, false],
  ["cybersecurity",    "domain-infra.png",    -18, 1.05, 1.00, false],
  ["dsa",              "domain-web.png",       26, 1.05, 0.93, false],
  ["blockchain",       "domain-infra.png",     42, 1.00, 0.90, true],
  ["embedded",         "domain-ai.png",       118, 1.05, 0.88, false],
  ["design",           "domain-creative.png",   0, 1.00, 1.00, false],
  ["documentation",    "domain-creative.png", -32, 0.85, 0.86, true],
  ["smm_content",      "domain-creative.png",  28, 1.10, 0.88, false],
  ["publicity",        "domain-creative.png",  58, 1.10, 0.94, true],
  ["sponsorship",      "domain-creative.png",  96, 1.05, 0.84, false],
  ["management",       "domain-web.png",      190, 0.95, 0.90, true],
  ["public_relations", "domain-infra.png",     84, 1.05, 0.92, true]
];

/**
 * The plates sit on a very slightly off-white ground, not #FFFFFF. Extending
 * with pure white draws a visible seam, so the background is taken from the
 * source's own corner pixel.
 */
async function ground(plate) {
  const { data, info } = await sharp(path.join(SRC_DIR, plate))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const i = 0; // top-left pixel
  return {
    r: data[i],
    g: data[i + 1],
    b: data[i + 2],
    alpha: info.channels === 4 ? data[i + 3] / 255 : 1
  };
}

async function build([slug, plate, hue, saturation, scale, mirror]) {
  const inner = Math.round(SIZE * scale);
  const free = SIZE - inner;

  let image = sharp(path.join(SRC_DIR, plate));
  if (mirror) image = image.flop();
  const resized = await image
    .resize(inner, inner, { fit: "fill" })
    .modulate({ hue, saturation })
    .toBuffer();

  const pad = Math.floor(free / 2);
  const buffer = await sharp(resized)
    .extend({
      top: pad,
      bottom: free - pad,
      left: pad,
      right: free - pad,
      background: await ground(plate)
    })
    .png({ palette: true, quality: 92, compressionLevel: 9 })
    .toBuffer();

  await writeWithRetry(path.join(OUT_DIR, `${slug}.png`), buffer);
  return { slug, plate, bytes: buffer.length };
}

/**
 * Windows can hold a just-created file open (antivirus, search indexer, a
 * browser previewing the folder), which surfaces as `UNKNOWN: unknown error,
 * open`. Retrying briefly beats losing the whole run after twelve good writes.
 */
async function writeWithRetry(file, buffer, attempts = 6) {
  for (let i = 0; ; i += 1) {
    try {
      await fs.writeFile(file, buffer);
      return;
    } catch (err) {
      if (i >= attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 250 * (i + 1)));
    }
  }
}

await fs.mkdir(OUT_DIR, { recursive: true });
const written = [];
for (const row of PLATES) written.push(await build(row));

for (const w of written) {
  console.log(`${w.slug.padEnd(18)} ${w.plate.padEnd(20)} ${Math.round(w.bytes / 1024)} KB`);
}
console.log(`${written.length} department covers written to public/departments/`);
