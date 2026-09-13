// Screenshot loop helper. Usage: node load/shoot.js [landing|auth|all] [--theme=light|dark]
const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

(async () => {
  const mode = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "all";
  const themeArg = process.argv.find((a) => a.startsWith("--theme="));
  const theme = themeArg ? themeArg.split("=")[1] : "dark";
  const suffix = theme === "light" ? "-light" : "";
  const dir = path.join(__dirname, "..", ".screenshots");
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  const shots = [];
  if (mode === "landing" || mode === "all") {
    shots.push(["landing-desktop", "/", { width: 1440, height: 900 }]);
    shots.push(["landing-mobile", "/", { width: 390, height: 844 }]);
  }
  if (mode === "auth" || mode === "all") {
    shots.push(["login-desktop", "/login", { width: 1440, height: 900 }]);
    shots.push(["register-desktop", "/register", { width: 1440, height: 900 }]);
    shots.push(["setup-desktop", "/setup", { width: 1440, height: 900 }]);
  }
  for (const [name, url, vp] of shots) {
    const page = await browser.newPage({ viewport: vp });
    await page.goto("http://127.0.0.1:3000" + url, { waitUntil: "networkidle" });
    await page.evaluate((t) => localStorage.setItem("loom-theme", t), theme);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(dir, name + suffix + ".png") });
    await page.close();
    console.log("shot", name + suffix);
  }
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
