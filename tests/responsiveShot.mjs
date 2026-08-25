import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { startServer } from "./staticServer.mjs";

const OUT = join(process.cwd(), "test-results", "responsive");
const VIEWPORTS = [
  { name: "iphone-14-pro", width: 430, height: 932 },
  { name: "phone-360", width: 360, height: 740 },
  { name: "phone-land", width: 844, height: 390 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "laptop-1280", width: 1280, height: 720 },
  { name: "desktop-1440", width: 1440, height: 900 },
];

async function boot(page, baseUrl) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => window.__GAME__ && window.__GAME__.scene.isActive("MenuScene"),
    null,
    { timeout: 20000 }
  );
  await page.waitForTimeout(400);
}

async function startScene(page, key, data) {
  await page.evaluate(
    ({ key, data }) => {
      const g = window.__GAME__;
      g.scene.getScenes(true).forEach((s) => g.scene.stop(s.scene.key));
      g.scene.start(key, data || {});
    },
    { key, data }
  );
  await page.waitForFunction(
    (key) => window.__GAME__.scene.isActive(key),
    key,
    { timeout: 15000 }
  );
  if (key === "GameScene") {
    await page.waitForFunction(
      () => {
        const gs = window.__GAME__.scene.getScene("GameScene");
        return gs && gs.order && gs.order.length > 0;
      },
      null,
      { timeout: 15000 }
    );
  }
  if (key === "BooksScene") {
    await page.waitForTimeout(800);
  }
  await page.waitForTimeout(500);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { server, port } = await startServer();
  const baseUrl = `http://127.0.0.1:${port}/?test=1`;
  const browser = await chromium.launch();
  try {
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
      await boot(page, baseUrl);
      await page.screenshot({ path: join(OUT, `${vp.name}-menu.png`) });
      await startScene(page, "GameScene", { level: 1 });
      await page.screenshot({ path: join(OUT, `${vp.name}-game1.png`) });
      await startScene(page, "GameScene", { level: 2 });
      await page.screenshot({ path: join(OUT, `${vp.name}-game2.png`) });
      await startScene(page, "LevelSelectScene");
      await page.screenshot({ path: join(OUT, `${vp.name}-levels.png`) });
      await startScene(page, "BooksScene");
      await page.screenshot({ path: join(OUT, `${vp.name}-books.png`) });
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`wrote shots to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
