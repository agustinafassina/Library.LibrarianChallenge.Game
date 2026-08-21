import { chromium } from "playwright";
import { startServer } from "./staticServer.mjs";

const PORTRAIT = { width: 390, height: 844 };
const LAUNCH_ARGS = [
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
];

async function boot(page, baseUrl) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => window.__GAME__ && window.__GAME__.scene.isActive("MenuScene"),
    null,
    { timeout: 15000 }
  );
}

async function playLevel(page, level) {
  await page.evaluate((lvl) => {
    const g = window.__GAME__;
    ["MenuScene", "LevelSelectScene", "LevelCompleteScene", "BooksScene"].forEach((k) =>
      g.scene.stop(k)
    );
    g.scene.start("GameScene", { level: lvl });
  }, level);

  await page.waitForFunction(
    () => {
      const gs = window.__GAME__.scene.getScene("GameScene");
      return gs && gs.scene.isActive() && gs.levelDef && gs.order && gs.order.length > 0 && !gs.solved;
    },
    null,
    { timeout: 15000 }
  );

  const layout = await page.evaluate(() => {
    const gs = window.__GAME__.scene.getScene("GameScene");
    return {
      width: gs.scale.width,
      height: gs.scale.height,
      portrait: gs.ui?.portrait,
      stackedHud: gs.ui?.stackedHud,
      flipGutter: gs.ui?.flipGutter,
      bookCount: gs.order.length,
      pageCount: gs.pageCount,
    };
  });

  if (!layout.portrait) {
    throw new Error(
      `Expected portrait layout at ${PORTRAIT.width}x${PORTRAIT.height}, got ${layout.width}x${layout.height}`
    );
  }
  if (!layout.stackedHud) {
    throw new Error("Expected stacked HUD in portrait");
  }
  if (!(layout.flipGutter >= 56)) {
    throw new Error(`Expected a wide flip gutter in portrait, got ${layout.flipGutter}`);
  }

  const solved = await page.evaluate(() =>
    window.__GAME__.scene.getScene("GameScene").autosolve()
  );
  if (!solved) throw new Error(`Level ${level} did not solve after autosolve()`);

  await page.waitForFunction(
    () => window.__GAME__.scene.isActive("LevelCompleteScene"),
    null,
    { timeout: 20000 }
  );

  return layout;
}

async function main() {
  const { server, port } = await startServer();
  const baseUrl = `http://127.0.0.1:${port}/?test=1`;
  const browser = await chromium.launch({ args: LAUNCH_ARGS });
  const page = await browser.newPage({
    viewport: PORTRAIT,
    isMobile: true,
    hasTouch: true,
  });

  const failures = [];
  page.on("pageerror", (e) => {
    console.error(`pageerror: ${e.message}`);
    failures.push(`pageerror: ${e.message}`);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") failures.push(`console.error: ${msg.text()}`);
  });

  try {
    console.log(`Opening ${baseUrl} at ${PORTRAIT.width}x${PORTRAIT.height}`);
    await boot(page, baseUrl);
    console.log("Menu booted in portrait.");

    const level1 = await playLevel(page, 1);
    console.log(
      `  Level 1 solved (${level1.bookCount} books, ${level1.pageCount} page(s), gutter ${level1.flipGutter}px)`
    );

    const later = await playLevel(page, 20);
    console.log(
      `  Level 20 solved (${later.bookCount} books, ${later.pageCount} page(s))`
    );

    await page.evaluate(() => {
      const g = window.__GAME__;
      ["GameScene", "LevelCompleteScene"].forEach((k) => g.scene.stop(k));
      g.scene.start("BooksScene");
    });
    await page.waitForFunction(
      () => window.__GAME__.scene.isActive("BooksScene"),
      null,
      { timeout: 15000 }
    );
    console.log("  Books catalogue opened.");

    if (failures.length) {
      throw new Error(`Browser reported errors:\n${failures.join("\n")}`);
    }

    console.log("\nPortrait smoke passed.");
  } finally {
    await page.close();
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(`\nPORTRAIT E2E FAILED: ${err.message}`);
  process.exitCode = 1;
});
