# Devpost submission: copy-paste guide

Go through the Devpost form top to bottom. Each heading below matches a field on the form. Copy the text in the grey box into that field.

---

## Page 1: Project overview

### Project name

```
KudiDesk
```

### Elevator pitch (max 200 characters)

```
An AI payments desk for African freelancers: turn client chats into PayPal invoices, ask your invoices in plain English, and let an agent chase late payers, all in naira.
```

### Thumbnail

Upload `docs/brand/kudidesk-devpost-thumbnail.png` (1500×1000, 3:2).

---

## Page 2: Project details

### About the project (Markdown is supported, so paste all of this)

```markdown
## Inspiration

I'm Husseini, a freelancer and account officer in Nigeria. Since January 2026, Nigerians can receive PayPal payments, paid out through Paga. That opened the door for thousands of designers, developers and writers like me to bill clients in London, Berlin and Toronto.

But getting paid is still messy. Prices are agreed in WhatsApp threads, invoices live in PayPal, the "who still owes me?" list lives in a spreadsheet, and every amount has to be converted to naira in your head. Chasing a late client is awkward, so it often doesn't happen, and money slips through.

I wanted one desk where every client payment is visible in naira, and where AI does the boring, awkward parts.

## What it does

KudiDesk is a payments workspace built on **PayPal Invoicing**, with **Gemini** doing the heavy lifting:

- **Paste a client chat → get an invoice.** Paste a WhatsApp or email thread. Gemini extracts the client, email, line items, the *final negotiated* price, currency and due date ("we pay within 2 weeks" becomes a date). It pre-fills a PayPal invoice, highlights AI-filled fields and flags anything uncertain. You review, then send a real PayPal invoice.
- **Ask your invoices in plain English.** "Unpaid clients over ₦500k, biggest first" becomes real **AG Grid** filter and sort state. The column filters, sort arrows, pinned totals row and income chart all update, and you can inspect the exact AG Grid API calls the AI generated.
- **A chase agent for late payers.** Select overdue invoices and the agent reads each one's context: days late, previous reminders, the client's payment history and other open invoices. It picks a tone (heads-up, gentle, firm or final), explains why, and drafts a short, polite note. You edit or untick drafts, and only then does KudiDesk send each one through **PayPal's invoice remind API**.
- **Payments land live.** **PayPal webhooks** (`INVOICING.INVOICE.PAID` and friends) are signature-verified, de-duplicated and re-checked against the PayPal API, and the row turns green within seconds with a toast showing what you were paid in naira. Clients who pay by bank transfer or Paga can be recorded with **Mark paid**, which writes the payment to the PayPal invoice.
- **Income in naira.** Received, Outstanding and Overdue totals plus a monthly income chart split by the currency clients paid in.

## How I built it

- **Next.js 15** (App Router, TypeScript) and **Tailwind CSS 4**
- **PayPal REST APIs (sandbox):** OAuth2; Invoicing v2 (create, send, list, get, remind, record payment); Webhooks with signature verification
- **Google Gemini** (REST, JSON mode) for the three AI features, with every response validated by **Zod** before it touches the UI or PayPal
- **AG Grid Community 36:** AI-driven `setFilterModel` and `applyColumnState`, row selection feeding the agent, a pinned totals row recomputed from filtered rows, `getRowId` for live webhook updates, row-class rules for the "just paid" flash, custom renderers, date filters and CSV export
- **AG Charts Community** for the income chart, which follows the grid's filters
- **Render:** deployed from a `render.yaml` Blueprint (free web service, health checks, environment-variable secrets)

## Challenges I ran into

- **Unreliable networks.** I built and tested on a mobile hotspot, where AI calls could hang. KudiDesk now prefers IPv4, applies per-model timeouts and a 25-second budget per AI request, falls back across Gemini models, and finally uses an offline parser so the app never freezes.
- **PayPal sandbox quirks.** Invoicing has to be enabled per app, the invoice list omits payment dates, and sandbox checkout was unreliable for Nigerian test accounts. I filled the gaps from the full invoice API and added "Mark paid" for off-PayPal payments, which turned into a genuinely useful feature.
- **Making AI safe to drive a UI.** Turning free text into grid state needed a small validated query language, per-column checks, and a clear way to show users exactly what the AI did.

## Accomplishments that I'm proud of

- A complete, working loop on real PayPal APIs: chat → invoice → AI reminder → payment → income chart.
- AI that *acts*, by driving a data grid and sending PayPal reminders, rather than just chatting, with a human approval step every time.
- It's built for the people who need it: naira-first, tolerant of patchy networks, and free to host.

## What I learned

Dependable AI is about the boring parts: strict output validation, graceful fallbacks and review steps. A well-designed grid API like AG Grid's filter model is what makes "natural language → real UI" possible.

## What's next for KudiDesk

- Live FX rates and Paga payout tracking, to show what actually lands in your Nigerian account
- Scheduled chasing: the agent proposes a weekly plan and you approve it once
- Sharing PayPal pay links over WhatsApp
- Multi-user accounts with persistent storage
```

### Built with (type each one and press Enter)

```
nextjs
typescript
react
tailwindcss
paypal
paypal-invoicing-api
paypal-webhooks
google-gemini
ag-grid
ag-charts
zod
render
```

### "Try it out" links

```
https://kudidesk-z3p7.onrender.com
https://github.com/husaynocean/kudidesk
```

### Image gallery (upload 4–6 images)

1. `docs/brand/kudidesk-devpost-thumbnail.png`
2. The dashboard (stats, income chart and grid)
3. The New invoice dialog after "Draft invoice" (purple AI fields and warning)
4. Ask-the-grid results with the "View AG Grid state" panel open
5. The chase dialog showing drafts with different tones
6. A paid row in green with the 💸 toast

Tip: pause the demo video at those moments and take a screenshot with **Win + Shift + S**.

### Video demo link

```
(paste your YouTube link here, and make sure it's Public)
```

---

## Page 3: Additional info (hackathon questions)

The exact questions may differ slightly; use whichever answers match.

### Which prizes are you submitting to? (tick all)

- Best Use of PayPal + AI
- Best Use of Agentic Commerce
- Best Use of AG Grid
- Best Use of Render

(The overall placings, Most Creative, Most Impactful and Best Demo Delivery prizes are judged from all submissions.)

### Code repository URL

```
https://github.com/husaynocean/kudidesk
```

### Hosted demo URL

```
https://kudidesk-z3p7.onrender.com
```

### Which PayPal technologies did you use, and how?

```
PayPal Invoicing API v2 (sandbox) is the core of KudiDesk: invoices are created and sent to clients (POST /v2/invoicing/invoices + /send), listed and read for the grid, reminded through /remind by the AI chase agent, and marked paid through /payments when a client pays by bank transfer or Paga. PayPal Webhooks (INVOICING.INVOICE.PAID, SENT, CREATED, CANCELLED, REFUNDED, UPDATED) are verified with /v1/notifications/verify-webhook-signature, de-duplicated, and re-checked against the Invoicing API before the dashboard updates live. Authentication uses OAuth2 client credentials.
```

### Which AI tools did you use, and how?

```
Google Gemini (gemini-flash-lite-latest, with automatic fallback to other Gemini Flash models) via the Gemini REST API in JSON mode, used for three features:
1) Chat-to-invoice: extracts client, email, line items, final negotiated prices, currency and due date from a pasted WhatsApp/email thread, and flags uncertainties.
2) Ask-the-grid: converts plain-English questions into a validated query that becomes native AG Grid filter and sort state.
3) Chase agent: for each overdue invoice, weighs days late, previous reminders, payment history and other open invoices, picks a tone, explains its reasoning and drafts the reminder, which is sent through PayPal's remind API only after the user approves.
Every Gemini response is validated with Zod, and each feature has an offline fallback.
I also used Claude Code (Anthropic) as a coding assistant while building the project.
```

### Sponsor tools used

```
AG Grid (invoice workspace, AI-driven filter model and column state, pinned totals, row selection, live row updates, CSV export), AG Charts (income chart), Render (hosting via render.yaml Blueprint).
```

### How do judges test it?

```
Open https://kudidesk-z3p7.onrender.com. It's on Render's free plan, so the first load can take up to a minute. Then try: (1) + New invoice → Use a sample chat → Draft invoice; (2) type "unpaid clients over ₦500k, biggest first" in the Ask box and click "View AG Grid state"; (3) select all overdue → Chase with AI → send; (4) click Mark paid on an unpaid row and watch it turn green. To run locally with no keys: git clone, npm install, npm run dev. Demo mode starts with sample data.
```

---

## Final checklist

- [ ] Video uploaded to YouTube as **Public**, under 3 minutes
- [ ] GitHub repo is public with the MIT licence showing (it does)
- [ ] Live site loads
- [ ] All three pages of the form filled in
- [ ] Clicked **Submit** (not just Save) before **12 Nov 2026, 9:00 PM WAT**
