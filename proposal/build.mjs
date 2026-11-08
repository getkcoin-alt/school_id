// Renders proposal.html to a print-ready A4 PDF.
// Usage: node proposal/build.mjs
// Drop Scriza's official logo at proposal/assets/scriza-logo.{svg,png} to use it
// instead of the text wordmark (use a white/light version: the cover is dark navy).
import { readFile, writeFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const exists = (p) => access(p).then(() => true, () => false);
const dataUri = async (path, mime) => `data:${mime};base64,${(await readFile(path)).toString("base64")}`;

async function scrizaLogo() {
  for (const [ext, mime] of [["svg", "image/svg+xml"], ["png", "image/png"]]) {
    const p = join(here, "assets", `scriza-logo.${ext}`);
    if (await exists(p)) {
      const uri = await dataUri(p, mime);
      return { big: `<img class="brand-logo" src="${uri}" alt="Scriza" />`, small: `<img class="brand-logo" src="${uri}" alt="Scriza" />` };
    }
  }
  const mark = `<div class="wordmark">SCRIZA<span>.</span></div>`;
  return { big: mark, small: mark };
}

const logo = await scrizaLogo();
const clientLogo = await dataUri(join(here, "..", "public", "logo.svg"), "image/svg+xml");
const html = (await readFile(join(here, "proposal.html"), "utf8"))
  .replaceAll("{{SCRIZA_LOGO}}", logo.big)
  .replaceAll("{{SCRIZA_LOGO_SMALL}}", logo.small)
  .replaceAll("{{CLIENT_LOGO}}", clientLogo);

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });
  const out = join(here, "Scriza_ID_Card_Studio_Proposal.pdf");
  await writeFile(out, await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true }));
  console.log(`Wrote ${out}`);
} finally {
  await browser.close();
}
