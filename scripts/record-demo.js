// Records the KudiDesk demo video: drives a real browser through every feature with a visible cursor
// and on-screen captions, and writes a .webm plus captions.srt (for timing a voiceover).
//
// Usage (against a fresh demo-mode server so the sample data is untouched):
//   npm run build && npx next start -p 3200
//   node scripts/record-demo.js http://localhost:3200 ./demo-video
//   ffmpeg -i demo-video/*.webm -vf fps=30,format=yuv420p -c:v libx264 -crf 20 kudidesk-demo.mp4
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.argv[2] || "http://localhost:3200";
const OUT = process.argv[3];
const W = 1440, H = 900;

const CURSOR_AND_CAPTIONS = `
(() => {
  if (window.__kd) return; window.__kd = true;
  const add = () => {
    const c = document.createElement('div'); c.id='kd-cursor';
    c.style.cssText='position:fixed;z-index:2147483647;width:22px;height:22px;left:-50px;top:-50px;pointer-events:none;transition:transform .08s';
    c.innerHTML='<svg width="22" height="22" viewBox="0 0 24 24"><path d="M3 2l7 19 2.5-7.5L20 11z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
    const r = document.createElement('div'); r.id='kd-ring';
    r.style.cssText='position:fixed;z-index:2147483646;width:34px;height:34px;border-radius:50%;border:3px solid #7c3aed;opacity:0;pointer-events:none;transform:translate(-50%,-50%) scale(.4);transition:all .35s';
    document.body.appendChild(r);
    const cap = document.createElement('div'); cap.id='kd-cap';
    cap.style.cssText='position:fixed;z-index:2147483645;left:50%;bottom:92px;transform:translateX(-50%);max-width:1000px;background:rgba(17,24,39,.92);color:#fff;font:500 21px/1.4 Inter,system-ui,sans-serif;padding:12px 22px;border-radius:14px;text-align:center;opacity:0;transition:opacity .4s;pointer-events:none;box-shadow:0 8px 30px rgba(0,0,0,.25)';
    document.body.appendChild(cap);
    window.addEventListener('mousemove', e => { c.style.left=e.clientX-3+'px'; c.style.top=e.clientY-2+'px'; }, true);
    window.addEventListener('mousedown', e => { r.style.left=e.clientX+'px'; r.style.top=e.clientY+'px'; r.style.opacity='1'; r.style.transform='translate(-50%,-50%) scale(1)'; setTimeout(()=>{r.style.opacity='0'; r.style.transform='translate(-50%,-50%) scale(.4)';},350); }, true);
  };
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
})();`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: OUT, size: { width: W, height: H } }, deviceScaleFactor: 1 });
  await ctx.addInitScript(CURSOR_AND_CAPTIONS);
  const t0 = Date.now();
  const page = await ctx.newPage();
    const cues = [];
  let mouse = { x: W / 2, y: H / 2 };

  async function caption(text, pos = "bottom") {
    const now = Date.now() - t0;
    if (cues.length && cues[cues.length - 1].end == null) cues[cues.length - 1].end = now;
    if (text) cues.push({ start: now, end: null, text });
    await page.evaluate(([t, pos]) => {
      const c = document.getElementById('kd-cap'); if (!c) return;
      if (!t) { c.style.opacity = '0'; return; }
      c.style.top = pos === 'top' ? '24px' : 'auto';
      c.style.bottom = pos === 'top' ? 'auto' : '92px';
      c.textContent = t; c.style.opacity = '1';
    }, [text, pos]).catch(() => {});
  }
  async function moveTo(x, y, steps = 28) {
    await page.mouse.move(x, y, { steps });
    mouse = { x, y };
  }
  async function clickOn(locator, { pause = 350 } = {}) {
    const l = typeof locator === "string" ? page.locator(locator).first() : locator;
    await l.scrollIntoViewIfNeeded();
    // Wait for any smooth scroll to finish so we click where the element really is.
    let b = await l.boundingBox();
    for (let i = 0; i < 20; i++) {
      await sleep(120);
      const n = await l.boundingBox();
      if (n && b && Math.abs(n.x - b.x) < 1 && Math.abs(n.y - b.y) < 1) break;
      b = n;
    }
    await moveTo(b.x + b.width / 2, b.y + b.height / 2);
    await sleep(pause);
    await l.click({ delay: 70 });
  }
  async function smoothScroll(toY, ms = 900) {
    await page.evaluate(([y, ms]) => window.scrollTo({ top: y, behavior: 'smooth' }), [toY, ms]);
    await sleep(ms);
  }
  async function card(title, sub, ms) {
    await page.setContent(`<html><body style="margin:0;height:100vh;display:grid;place-items:center;background:linear-gradient(135deg,#053321,#0b8a43);font-family:Inter,system-ui,sans-serif;color:#fff">
      <div style="text-align:center"><div style="display:inline-grid;place-items:center;width:84px;height:84px;border-radius:22px;background:#fff;color:#0b8a43;font-size:46px;font-weight:800;margin-bottom:26px">₦</div>
      <div style="font-size:64px;font-weight:800;letter-spacing:-1px">${title}</div>
      <div style="font-size:26px;opacity:.85;margin-top:14px;max-width:900px">${sub}</div></div></body></html>`);
    await sleep(ms);
  }

  // ---------- 0. Title card ----------
  await card("KudiDesk", "An AI payments desk for African freelancers paid through PayPal", 3500);

  // ---------- 1. Dashboard ----------
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".ag-row", { timeout: 60000 });
  await sleep(800);
  await moveTo(700, 300, 10);
  await caption("Since January, Nigerian freelancers can get paid through PayPal — but billing foreign clients still means WhatsApp threads, spreadsheets and awkward chasing.");
  await sleep(4500);
  await moveTo(1150, 420);
  await caption("KudiDesk puts every PayPal invoice in one AG Grid desk, in naira — and lets Gemini do the tedious parts.");
  await sleep(3000);
  await smoothScroll(560, 1400);
  await sleep(2000);
  await smoothScroll(0, 1000);

  // ---------- 2. Chat → invoice ----------
  await caption("A client agrees a price on WhatsApp. Paste the chat…");
  await clickOn('button:has-text("+ New invoice")');
  await page.waitForSelector('text=Draft from a client chat');
  await sleep(700);
  await clickOn('button:has-text("Use a sample chat")');
  await sleep(2200);
  await caption("…and Gemini pulls out the client, items, the final negotiated price (£300, not £350), currency and due date.");
  await clickOn('button:has-text("Draft invoice")');
  await page.waitForSelector('text=Fields shaded purple', { timeout: 45000 });
  await sleep(1500);
  const dialog = page.locator('form').filter({ hasText: 'New PayPal invoice' });
  await dialog.evaluate((el) => el.scrollTo({ top: 260, behavior: 'smooth' }));
  await sleep(1800);
  await caption("AI-filled fields are shaded purple and anything uncertain is flagged. You review — then send a real PayPal invoice.");
  await sleep(2500);
  await dialog.evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }));
  await sleep(1400);
  await clickOn('button:has-text("Create & send")');
  await page.waitForSelector('text=Invoice sent', { timeout: 30000 }).catch(() => {});
  await sleep(2200);

  // ---------- 3. Ask the grid ----------
  const ask = page.locator('input[aria-label="Ask the grid"]');
  await ask.scrollIntoViewIfNeeded();
  await smoothScroll(520, 1000);
  await caption("Ask your invoices in plain English.");
  await clickOn(ask);
  await page.keyboard.type("unpaid clients over ₦500k, biggest first", { delay: 55 });
  await sleep(500);
  await clickOn('button:has-text("Ask")');
  await page.waitForSelector('text=View AG Grid state', { timeout: 45000 });
  await sleep(1200);
  await caption("Gemini turns the question into real AG Grid filter and sort state. The totals row and the income chart follow the filter.");
  await moveTo(900, 700);
  await sleep(3500);
  await clickOn('button:has-text("View AG Grid state")');
  await sleep(1000);
  await caption("These are the exact AG Grid API calls the AI produced — validated before they ever touch the grid.");
  await sleep(4500);
  await clickOn('button:has-text("Clear")');
  await sleep(1200);

  // ---------- 4. Chase agent ----------
  await caption("Chasing late clients is awkward — so there's an agent for it.");
  await clickOn('button:has-text("select all overdue")');
  await sleep(1300);
  await clickOn('button:has-text("Chase with AI")');
  await page.waitForSelector('button:has-text("via PayPal")', { timeout: 45000 });
  await page.waitForFunction(() => !document.querySelector('.animate-pulse.h-36'), null, { timeout: 45000 }).catch(() => {});
  await sleep(1200);
  await caption("It weighs how late each invoice is, past reminders and the client's history, picks a tone and explains why.");
  const list = page.locator('div.overflow-y-auto').filter({ has: page.locator('textarea') }).first();
  await sleep(3200);
  await list.evaluate((el) => el.scrollTo({ top: 330, behavior: 'smooth' })).catch(() => {});
  await sleep(2600);
  await list.evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })).catch(() => {});
  await sleep(2400);
  await caption("Nothing goes out until you approve — then each reminder is sent through PayPal's invoice reminder API.");
  await clickOn('button:has-text("via PayPal")');
  await page.waitForSelector('text=Sent via PayPal', { timeout: 30000 });
  await page.waitForFunction(() => !document.body.innerText.includes('Sending…'), null, { timeout: 30000 });
  await sleep(2600);
  await clickOn(page.getByRole('button', { name: 'Close', exact: true }).last());
  await page.waitForSelector('div.fixed.inset-0', { state: 'detached', timeout: 10000 }).catch(() => console.log('WARN dialog still open'));
  await sleep(1500);

  // ---------- 5. Payment lands ----------
  await smoothScroll(0, 900);
  await caption("When a client pays, PayPal's webhook updates the grid live — verified, de-duplicated and re-checked against PayPal.", "top");
  await clickOn('button:has-text("Simulate a client payment")');
  await smoothScroll(760, 1200);
  await page.waitForSelector('text=💸', { timeout: 15000 }).catch(() => {});
  await sleep(3500);
  await caption("Paid by bank transfer or Paga instead? “Mark paid” records it on the PayPal invoice too.", "top");
  const markPaid = page.locator('button:has-text("Mark paid")').first();
  await markPaid.scrollIntoViewIfNeeded().catch(() => {});
  const mb = await markPaid.boundingBox().catch(() => null);
  if (mb) await moveTo(mb.x + mb.width / 2, mb.y + mb.height / 2);
  await sleep(3200);

  // ---------- 6. Wrap ----------
  await smoothScroll(180, 1100);
  await caption("Income in naira, split by the currency clients paid in. Deployed on Render from a Blueprint.");
  await moveTo(1180, 420);
  await sleep(4200);
  await caption(null);
  await card("KudiDesk", "Every client payment, one desk.<br><span style='font-size:20px;opacity:.8'>PayPal Invoicing · Webhooks · Gemini · AG Grid · Render — kudidesk-z3p7.onrender.com</span>", 4000);

  const total = Date.now() - t0;
  if (cues.length && cues[cues.length - 1].end == null) cues[cues.length - 1].end = total;
  const fmt = (ms) => { const d = new Date(ms).toISOString().slice(11, 23).replace('.', ','); return d; };
  fs.writeFileSync(path.join(OUT, "captions.srt"), cues.map((c, i) => `${i + 1}\n${fmt(c.start)} --> ${fmt(c.end)}\n${c.text}\n`).join("\n"));
  const vid = page.video();
  await ctx.close();
  await browser.close();
  console.log("video:", await vid.path(), "duration(s):", (total / 1000).toFixed(1));
})().catch((e) => { console.error(e); process.exit(1); });
