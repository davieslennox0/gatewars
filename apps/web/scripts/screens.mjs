// Screenshot every page at 1440px and 390px (plus the open menu and entry sheet at 390px) into apps/web/screens/.
// Usage: BASE=http://localhost:3100 node scripts/screens.mjs   (needs `playwright` + chromium installed)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const OUT = process.env.OUT ?? new URL("../screens/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const pages = ["/", "/arena/1", "/builder", "/challenges", "/circuits", "/leaderboard", "/me", "/agents", "/rules"];
const b = await chromium.launch();
for (const [tag, w, h] of [["1440", 1440, 900], ["390", 390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  for (const path of pages) {
    await p.goto(BASE + path, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(5000);
    const name = path === "/" ? "lobby" : path.slice(1).replace(/\//g, "_");
    await p.screenshot({ path: `${OUT}${name}-${tag}.png`, fullPage: true });
    console.log("shot", name, tag);
  }
  if (tag === "390") {
    await p.goto(BASE + "/", { waitUntil: "networkidle" }).catch(() => {});
    await p.waitForTimeout(3000);
    await p.click("button.hamburger");
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${OUT}menu-open-390.png` });
    await p.keyboard.press("Escape");
    await p.waitForTimeout(400);
    await p.click(".bottombar .btn.primary");
    await p.waitForTimeout(800);
    await p.screenshot({ path: `${OUT}entry-sheet-390.png` });
    console.log("shot menu + sheet");
  }
  await ctx.close();
}
await b.close();
