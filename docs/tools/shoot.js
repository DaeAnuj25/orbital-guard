/**
 * Capture REAL screenshots of the running ORBITAL GUARD app for the submission
 * documents. Every shot is taken after actually driving the UI (clicking Run,
 * setting the propagation window, moving the frame slider), so the figures show
 * genuine results rather than empty states.
 *
 * Usage:  npm run build && npx next start -p 3000 &
 *         NODE_PATH=/tmp/shots/node_modules node docs/tools/shoot.js
 * (puppeteer is installed outside the project so it is not an app dependency)
 */
const puppeteer = require("puppeteer");
const fs = require("fs");

const BASE = process.env.SHOT_BASE || "http://localhost:3000";
const OUT = process.env.SHOT_OUT || "/tmp/shots/out";
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickByText(page, text, tag = "button") {
  const ok = await page.evaluate((t, tg) => {
    const els = Array.from(document.querySelectorAll(tg));
    const el = els.find((e) => (e.textContent || "").trim().toLowerCase().includes(t.toLowerCase()) && !e.disabled);
    if (el) { el.scrollIntoView({ block: "center" }); el.click(); return true; }
    return false;
  }, text, tag);
  if (!ok) throw new Error(`button not found: ${text}`);
}

/** Set a React-controlled input value (native setter + input event). */
async function setInput(page, selector, value) {
  await page.evaluate((sel, val) => {
    const el = document.querySelector(sel);
    const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value");
    desc.set.call(el, val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, selector, value);
}

async function shot(page, name, opts = {}) {
  await sleep(opts.wait ?? 1200);
  const p = `${OUT}/${name}.png`;
  if (opts.selector) {
    const el = await page.$(opts.selector);
    if (el) { await el.screenshot({ path: p }); console.log("shot(element)", name); return; }
  }
  await page.screenshot({ path: p, fullPage: !!opts.fullPage });
  console.log("shot", name);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--force-color-profile=srgb"],
    defaultViewport: { width: 1440, height: 1000, deviceScaleFactor: 1.5 },
  });
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
  const go = async (p) => { await page.goto(BASE + p, { waitUntil: "networkidle2", timeout: 60000 }); await sleep(900); };

  await go("/");
  await shot(page, "01_mission");

  await go("/detection");
  await clickByText(page, "Run detection");
  await sleep(3500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "02_detection_page");
  await shot(page, "02b_detection_results", { selector: "section:has(canvas)", wait: 600 });

  await go("/tracking");
  await clickByText(page, "Run tracking");
  await sleep(4000);
  const slider = await page.$('input[type="range"][max="7"]');
  if (slider) { await slider.focus(); await page.keyboard.press("End"); }
  await sleep(1200);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "03_tracking_page");
  await shot(page, "03b_tracking_results", { selector: "section:has(canvas)", wait: 600 });

  await go("/orbital");
  await setInput(page, 'input[type="datetime-local"]', "2026-10-21T12:00");
  await sleep(400);
  await clickByText(page, "Validate & propagate");
  await sleep(4500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "04_orbital");
  await shot(page, "04b_orbital_results", { selector: "section:has(.recharts-wrapper)", wait: 900 });

  await go("/conjunction");
  await setInput(page, 'input[type="datetime-local"]', "2026-10-21T12:00");
  await sleep(400);
  await clickByText(page, "Run close-approach screening");
  await sleep(7000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "05_conjunction");
  await shot(page, "05b_conjunction_results", { selector: "section:has(.recharts-wrapper)", wait: 900 });

  await go("/dataset");
  await sleep(1500);
  await shot(page, "06_dataset_experiments", { selector: "section:has(.recharts-wrapper)", wait: 900 });
  await clickByText(page, "Run benchmark");
  await sleep(7000);
  await shot(page, "06b_dataset_benchmark");

  await go("/reports");
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "07_reports");

  await go("/tutorial");
  await shot(page, "08_tutorial");
  await go("/how-built");
  await shot(page, "09_how_built");

  // Optional: real dataset image through the ONNX engine (only if the file exists).
  const realImg = process.env.SHOT_REAL_IMAGE;
  if (realImg && fs.existsSync(realImg)) {
    await go("/detection");
    const input = await page.$('input[type="file"]');
    await input.uploadFile(realImg);
    await sleep(1200);
    await page.evaluate(() => {
      const sel = Array.from(document.querySelectorAll("select")).find((s) => Array.from(s.options).some((o) => o.value === "onnx"));
      if (sel) {
        const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(sel), "value");
        desc.set.call(sel, "onnx");
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await sleep(900);
    await clickByText(page, "Run detection");
    await sleep(7000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, "10_detection_onnx_page");
    await shot(page, "10b_detection_onnx_results", { selector: "section:has(canvas)", wait: 600 });
  }

  await browser.close();
  console.log("SCREENSHOTS_DONE");
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
