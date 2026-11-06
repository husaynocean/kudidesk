# Devpost submission — KudiDesk

Copy each section into the matching Devpost field. Edit anything that doesn't sound like you.

---

## Project name

KudiDesk

## Tagline (short)

An AI payments desk for African freelancers paid by foreign clients through PayPal.

## Links

- Live demo: https://kudidesk-z3p7.onrender.com
- Code: https://github.com/husaynocean/kudidesk
- Video: _(add your YouTube link — must be **Public**, under 3 minutes)_

## Prize categories to tick

- Best Use of PayPal + AI
- Best Use of Agentic Commerce (the chase agent: AI decides, drafts and acts through PayPal's remind API, with human approval)
- Best Use of AG Grid
- Best Use of Render
- (Automatically considered: overall placings, Most Creative, Most Impactful, Best Demo Delivery)

## Tools used (Devpost asks for this explicitly)

- **Google Gemini** (`gemini-flash-lite-latest`, falling back to other Flash models) via the Gemini REST API in JSON mode. Used for three things: (1) extracting a structured invoice from a pasted client chat, (2) translating plain-English questions into AG Grid filter/sort state, and (3) the chase agent, which chooses a tone per overdue invoice from its context, explains why, and drafts the reminder. All outputs are validated with Zod before use.
- **PayPal Developer Platform (sandbox):** Invoicing API v2 (create, send, list, get, remind, record payment), Webhooks (INVOICING.INVOICE.* with signature verification), OAuth2.
- **AG Grid Community 36** and **AG Charts Community 14** for the invoice workspace and income chart.
- **Render** (Blueprint `render.yaml`, free web service, health checks) for hosting.
- **Claude Code** (Anthropic) was used as a coding assistant during development.

## Submission checklist (from the rules)

- [ ] Public GitHub repo with LICENSE (MIT) visible — github.com/husaynocean/kudidesk
- [ ] Hosted demo URL — https://kudidesk-z3p7.onrender.com
- [ ] Setup and run instructions — README
- [ ] Video under 3 minutes, **Public** on YouTube, no copyrighted music
- [ ] Text description + tools section (below)

---

## Inspiration

Since January 2026, Nigerians can receive PayPal payments, paid out through Paga. That opened the door for thousands of designers, developers and writers to bill clients in London, Berlin and Toronto. But the work around getting paid didn't get easier. Prices are agreed in WhatsApp threads, invoices live in PayPal, the "who still owes me?" list lives in a spreadsheet, and every amount has to be converted to naira in your head. Chasing a late client is awkward, so it often doesn't happen, and money slips through.

I wanted one desk where every client payment is visible in naira, and where AI does the boring, awkward parts.

## What it does

KudiDesk is a payments workspace built on PayPal Invoicing, with Gemini doing the heavy lifting:

- **Paste a client chat → get an invoice.** Paste a WhatsApp or email thread. Gemini extracts the client, email, line items, the *final negotiated* price, currency and due date ("we pay within 2 weeks" becomes a date), and pre-fills a PayPal invoice. AI-filled fields are highlighted and ambiguities are flagged. You review, then send.
- **Ask your invoices in plain English.** "Unpaid UK clients over £200, oldest first" becomes real AG Grid filter and sort state. The column filters, the sort arrows, the pinned totals row and the income chart all update. You can inspect the exact AG Grid API calls the AI generated.
- **A chase agent for overdue clients.** Select unpaid invoices and the agent reads each one's context: days late, previous reminders, the client's payment history and other open invoices. It picks a tone (heads-up, gentle, firm or final), explains why, and drafts a short, polite note. You edit or untick drafts, and only then does KudiDesk send each one through PayPal's invoice remind API.
- **Payments land live.** PayPal webhooks (`INVOICING.INVOICE.PAID` and friends) turn a row green within seconds, with a toast showing what you were paid in naira. Clients who pay by bank transfer or Paga can be recorded with **Mark paid**, which writes the payment to the PayPal invoice.
- **Income in naira.** Received / Outstanding / Overdue totals and a monthly income chart split by the currency clients paid in.

## How I built it

- **Next.js 15 (App Router, TypeScript) + Tailwind 4**, deployed on **Render** with a `render.yaml` Blueprint (free web service, Frankfurt region, health checks).
- **PayPal REST APIs:** OAuth2, Invoicing v2 (create, send, list, get, remind, record payment) and Webhooks with signature verification.
- **Google Gemini** (REST, JSON mode) for the three AI features. Every response is validated with **Zod**, and grid queries are checked column by column before they reach the grid.
- **AG Grid Community 36:** AI-driven `setFilterModel` and `applyColumnState`, multi-row selection feeding the agent, a pinned totals row recomputed from the filtered rows, `getRowId` for stable live updates, row class rules for the "just paid" flash, custom cell renderers, date filters and CSV export.
- **AG Charts Community** for the income chart, which follows the grid's filters.

## Design decisions I'm proud of

- **Human in the loop.** AI proposes, the freelancer decides. Nothing is sent to a client without a review step.
- **Webhooks are hints, PayPal is the truth.** The handler verifies PayPal's signature, ignores duplicate deliveries, and re-reads the invoice from the PayPal API before showing a payment. A forged webhook can't mark an invoice paid.
- **It never breaks in a demo.** If Gemini is busy or unreachable, requests retry, fall back to lighter models, and finally use an offline parser or templates, with a visible note explaining why. Without any keys, it runs in demo mode with realistic sample data.

## Challenges I ran into

- **Unreliable networks.** Testing on a mobile hotspot made Gemini calls hang. I added IPv4-first DNS, per-model timeouts, a 25-second budget per AI request, automatic fallback across Gemini models, and a one-click `/api/health?check=ai` diagnostic.
- **PayPal sandbox quirks.** Invoicing has to be enabled per app, the invoice list omits payment dates and pay links, and sandbox checkout was unreliable for Nigerian test accounts. I filled the gaps from the full invoice API and added "Mark paid" for off-PayPal payments, which turned out to be a genuinely useful feature.
- **Keeping AI output safe for a UI.** Translating free text into grid state needed a small query language, validation per column type, and a clear way to show users what the AI did.

## Accomplishments that I'm proud of

- A complete loop: chat → invoice → reminder → payment → income chart, all on real PayPal APIs.
- AI that drives a real data grid rather than just chatting about the data.
- It works for the people it's meant for: naira-first, mobile-network tolerant, and free to host.

## What I learned

How to make AI features dependable rather than flashy: strict output validation, graceful fallbacks and review steps. Also how much a well-designed grid API (AG Grid's filter model) makes "natural language to UI" possible.

## What's next for KudiDesk

- Live FX rates and Paga payout tracking, so you see what actually lands in your Nigerian account.
- Automatic chasing schedules (the agent proposes, you approve once a week).
- WhatsApp sharing of PayPal pay links.
- Multi-user accounts with persistent storage.

## Built with

nextjs, typescript, react, tailwindcss, paypal-invoicing-api, paypal-webhooks, google-gemini, ag-grid, ag-charts, zod, render

---

# Demo video script (target 2:45, max 3:00)

Upload as **Public** on YouTube (the rules require public, not unlisted). Record on the live site at 100% zoom. Open it a minute early so Render's free instance is awake. Close other tabs and notifications.

| Time | On screen | Say |
|---|---|---|
| 0:00–0:20 | Dashboard | "Since January, Nigerian freelancers can get paid through PayPal. But billing foreign clients still means WhatsApp threads, spreadsheets and awkward chasing. This is KudiDesk: an AI payments desk on PayPal Invoicing, AG Grid and Gemini." |
| 0:20–0:55 | + New invoice → paste a chat → Draft invoice | "A client agrees a price on WhatsApp. I paste the chat, and Gemini pulls out the client, items, the final negotiated price — £300, not £350 — the currency and the due date. It flags what it's unsure about. I review, and send a real PayPal invoice." Click Create & send. |
| 0:55–1:30 | Ask box → "unpaid clients over ₦500k, biggest first" → View AG Grid state | "I can ask my invoices in plain English. Gemini turns that into real AG Grid filter and sort state — here are the exact API calls. The totals row and the income chart follow the filter." |
| 1:30–2:10 | Select overdue → ✨ Chase with AI → show tones/reasons → Send | "Chasing late clients is awkward, so I made an agent for it. It looks at how late each invoice is, past reminders and the client's history, picks a tone, explains why, and drafts a polite note. Nothing goes out until I approve — then it's sent through PayPal's reminder API." |
| 2:10–2:35 | Mark paid (or pay via Pay link) → row flashes green, toast | "When a client pays, PayPal's webhook updates the grid live. Verified, de-duplicated, and re-checked against PayPal. Paid by bank transfer or Paga? Mark paid records it on the PayPal invoice too." |
| 2:35–2:50 | Chart + Render dashboard (optional) | "Income in naira, by currency, deployed on Render from a Blueprint. KudiDesk: every client payment, one desk." |

## Screenshots to upload (5–6)

1. Dashboard overview (stats, chart, grid).
2. New invoice dialog after "Draft invoice", with purple AI-filled fields and the warning.
3. Ask-the-grid result with chips and the "View AG Grid state" panel open.
4. Chase dialog showing two or three drafts with different tones.
5. A row flashing green with the 💸 toast.
6. (Optional) Render dashboard showing the Blueprint-managed service.
