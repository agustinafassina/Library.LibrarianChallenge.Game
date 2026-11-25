// Fails if js/runtime-config.js holds local/production values instead of the
// safe defaults. `npm run build` overwrites that file from .env, so this guards
// against committing an API key or a localhost API URL by accident.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const configPath = path.join(root, "js", "runtime-config.js");

const sandbox = { window: {}, document: { createElement: () => ({}), head: { appendChild() {} } } };
vm.runInNewContext(fs.readFileSync(configPath, "utf8"), sandbox);
const config = sandbox.window.LIBRARIAN_CHALLENGE_CONFIG || {};

const problems = [];
if (config.apiKey) problems.push("apiKey is set");
if (config.apiBaseUrl) problems.push(`apiBaseUrl is set (${config.apiBaseUrl})`);
if (config.useApiBooks) problems.push("useApiBooks is true");
if (config.recaptchaSiteKey) problems.push("recaptchaSiteKey is set");

if (problems.length) {
  console.error(
    `[check] js/runtime-config.js must keep the safe defaults: ${problems.join(", ")}.`
  );
  console.error("[check] Restore it with `git restore js/runtime-config.js` before committing.");
  process.exit(1);
}
console.log("[check] js/runtime-config.js uses safe defaults.");
