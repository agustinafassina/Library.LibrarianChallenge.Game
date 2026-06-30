import http from "node:http";
import { readFile, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, extname } from "node:path";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      const rel = urlPath === "/" ? "/index.html" : urlPath;
      const filePath = normalize(join(ROOT, rel));
      if (!filePath.startsWith(ROOT)) {
        res.writeHead(403).end("Forbidden");
        return;
      }
      readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404).end("Not found");
          return;
        }
        res.writeHead(200, {
          "Content-Type": CONTENT_TYPES[extname(filePath)] || "application/octet-stream",
        });
        res.end(data);
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

async function main() {
  const levels = JSON.parse(readFileSync(join(ROOT, "data", "levels.json"), "utf8"));
  const totalLevels = levels.length;

  const { server, port } = await startServer();
  const baseUrl = `http://127.0.0.1:${port}/?test=1`;

  const browser = await chromium.launch();
  const page = await browser.newPage();

  const failures = [];
  page.on("pageerror", (e) => failures.push(`pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") failures.push(`console.error: ${msg.text()}`);
  });

  try {
    console.log(`Opening ${baseUrl}`);
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

    await page.waitForFunction(
      () => window.__GAME__ && window.__GAME__.scene.isActive("MenuScene"),
      null,
      { timeout: 15000 }
    );
    console.log(`Game booted. Running ${totalLevels} levels...`);

    for (let level = 1; level <= totalLevels; level++) {
      await page.evaluate((lvl) => {
        const g = window.__GAME__;
        ["MenuScene", "LevelSelectScene", "LevelCompleteScene"].forEach((k) => g.scene.stop(k));
        g.scene.start("GameScene", { level: lvl });
      }, level);

      await page.waitForFunction(
        () => {
          const gs = window.__GAME__.scene.getScene("GameScene");
          return (
            gs && gs.scene.isActive() && gs.levelDef && gs.order && gs.order.length > 0 && !gs.solved
          );
        },
        null,
        { timeout: 15000 }
      );

      const bookCount = await page.evaluate(
        () => window.__GAME__.scene.getScene("GameScene").order.length
      );

      const solved = await page.evaluate(() =>
        window.__GAME__.scene.getScene("GameScene").autosolve()
      );
      if (!solved) throw new Error(`Level ${level} did not solve after autosolve()`);

      await page.waitForFunction(
        () => window.__GAME__.scene.isActive("LevelCompleteScene"),
        null,
        { timeout: 10000 }
      );

      console.log(`  Level ${level}/${totalLevels} solved (${bookCount} books) OK`);
    }

    const maxUnlocked = await page.evaluate(() =>
      Number(localStorage.getItem("librarians-challenge:maxLevelUnlocked"))
    );
    if (!(maxUnlocked >= totalLevels)) {
      throw new Error(`Expected progress to reach level ${totalLevels}, got ${maxUnlocked}`);
    }

    if (failures.length) {
      throw new Error(`Browser reported errors:\n${failures.join("\n")}`);
    }

    console.log(`\nAll ${totalLevels} levels passed. Progress saved up to level ${maxUnlocked}.`);
  } finally {
    await page.close();
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(`\nE2E TEST FAILED: ${err.message}`);
  process.exitCode = 1;
});
