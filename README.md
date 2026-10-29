# KudiDesk

**An AI payments desk for African freelancers paid by foreign clients through PayPal.**

Since January 2026, Nigerians can receive PayPal payments, paid out through Paga. A Lagos designer billing clients in London, Berlin and Toronto still juggles WhatsApp threads, email, spreadsheets and FX maths, and unpaid invoices slip through. KudiDesk puts every PayPal invoice in one AG Grid workspace in naira terms. AI then does the tedious parts:

- **Paste a client chat → get an invoice.** Gemini reads the WhatsApp or email thread and pre-fills a PayPal invoice for you to review.
- **Ask the grid in plain English.** "Unpaid UK clients over £200, oldest first" becomes real AG Grid filter and sort state.
- **Chase overdue clients with an agent.** It writes a tailored reminder for each client and sends them through PayPal's remind API once you approve.
- **See payments land live.** PayPal webhooks turn a row green the moment a client pays.

> Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com) (Oct–Nov 2026). Entered for Best Use of PayPal + AI / Agentic Commerce, Best Use of AG Grid, and Best Use of Render.

## For judges: a 3-minute tour

You can run everything with **no keys at all**: KudiDesk starts in **Demo data** mode with six months of sample invoices, and the AI features fall back to an offline parser. Add a free Gemini key to see the real AI. Add PayPal sandbox keys to run against PayPal.

1. **Ask the grid:** click the chip `unpaid UK clients over £200, oldest first`. The grid filters and sorts, and the column filter icons light up. Click **View AG Grid state** to see the `setFilterModel` and `applyColumnState` calls the AI produced. The income chart redraws for the filtered rows.
2. **Chase:** click **select all overdue**, then **✨ Chase with AI**. Each draft has a tone (heads-up, gentle, firm or final) and a one-line reason. Edit or untick any draft, then click **Send … via PayPal**. Each row then shows "reminded just now".
3. **Get paid:** click **Simulate a client payment**. This sends a fake `INVOICING.INVOICE.PAID` webhook through the real handler. The row flashes green and a 💸 toast shows the naira value. With PayPal keys, paying a real sandbox invoice does the same thing through a real webhook.
4. **Invoice from a chat:** click **+ New invoice → Use a sample chat → Draft invoice**. AI-filled fields are shaded purple until you edit them, and anything ambiguous is listed as a warning.

## Features

| | Feature | Built with |
|---|---|---|
| ✨ | Chat → invoice draft: client, email, items, final negotiated prices, currency, due date ("within 2 weeks" → a date) | Gemini (JSON output) + Zod validation |
| ✨ | Ask the grid: plain English → validated query → native AG Grid filter model + column state | Gemini + AG Grid API |
| ✨ | Chase agent: reads days late, previous reminders, payment history and other open invoices, picks a tone, drafts a note, and sends after human review | Gemini + PayPal Invoicing `remind` |
| 💸 | Live payments: webhook → signature check → re-read from PayPal → dashboard updates within seconds | PayPal Webhooks |
| 📊 | Income chart: naira received per month, stacked by payment currency, following the grid's filters | AG Charts Community |
| 🧾 | Create and send PayPal invoices in USD, GBP, EUR or CAD | PayPal Invoicing v2 |
| ₦ | Naira value per invoice, Received / Outstanding / Overdue totals, and a pinned totals row that follows filters | AG Grid |
| ⬇ | CSV export, quick search, row selection, overdue highlighting | AG Grid |

### Design choices worth knowing

- **AI proposes and you decide.** Invoices and reminders always go through a review step, and nothing is sent to a client until you click send.
- **AI output is never trusted blindly.** Every Gemini response is parsed with Zod. Grid queries are also checked column by column, so an operator that doesn't fit a column's type is dropped. A bad answer can't break the grid or send garbage to PayPal.
- **Webhooks are hints, and PayPal is the truth.** The handler verifies PayPal's signature (when `PAYPAL_WEBHOOK_ID` is set), ignores duplicate deliveries, and re-reads the invoice from the PayPal API before showing a payment. A forged webhook therefore can't mark an invoice paid.
- **The app runs without keys.** Each AI feature has an offline fallback (rules-based parser, templates), so the demo never breaks.

## AG Grid usage

- `setFilterModel` and `applyColumnState` driven by AI, with multi-condition text, number and date filters (`OR` across states, `AND` across ranges). Hidden columns (`currency`, `daysOverdue`) are revealed when the AI filters on them.
- `rowSelection` (multi-row, `isRowSelectable` limited to unpaid invoices) feeds the chase agent.
- `pinnedBottomRowData` holds a live totals row, recomputed from `forEachNodeAfterFilter` on `modelUpdated`. The same filtered rows drive the AG Charts income chart.
- `getRowId` plus immutable row updates keep the grid stable when webhooks arrive. `rowClassRules` flash the row that was just paid.
- Custom cell renderers (status pills with "reminded 2m ago", client + email), `cellDataType: 'dateString'` with date filters, `cellClassRules` for overdue dates, and `exportDataAsCsv`.
- Theming API (`themeQuartz.withParams`) matched to the KudiDesk palette.

## Tech stack

- **Next.js 15** (App Router, TypeScript), **Tailwind CSS 4**
- **PayPal REST APIs** (sandbox): OAuth2, Invoicing v2 (create, send, list, get, remind), Webhooks (verify signature)
- **Google Gemini API** (REST, JSON mode). The default model is `gemini-flash-latest`.
- **AG Grid Community 36** and **AG Charts Community 14**
- **Zod** to validate every request and every AI response
- **Render** for hosting (`render.yaml` Blueprint)

## Run it locally

Requires **Node.js 20+**.

```bash
git clone https://github.com/husaynocean/kudidesk.git
cd kudidesk
npm install
cp .env.example .env.local   # all values optional
npm run dev
```

Open http://localhost:3000, then http://localhost:3000/api/health to see which mode you're in.

### 1. Turn on the AI (Gemini, free)

1. Create a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Add it to `.env.local`:
   ```env
   GEMINI_API_KEY=your-key
   ```
3. Restart. The header badge changes from **AI offline** to **✨ Gemini**.

### 2. Connect the PayPal sandbox

1. Sign in at [developer.paypal.com](https://developer.paypal.com) and switch to **Sandbox**.
2. Go to **Apps & Credentials → Sandbox → Create App** (type: Merchant) and copy the **Client ID** and **Secret** into `.env.local`:
   ```env
   PAYPAL_CLIENT_ID=your-sandbox-client-id
   PAYPAL_CLIENT_SECRET=your-sandbox-secret
   ```
3. Restart and open `/api/health`. You should see `"paypal": "connected to sandbox ✔"`.
4. Under **Testing Tools → Sandbox Accounts**, note a **Personal** account's email and password. That account plays your client.

### 3. Get live payment updates (webhooks)

PayPal needs a public HTTPS URL. Use your Render URL, or a tunnel such as `ngrok http 3000` when running locally.

1. In your sandbox app, open **Webhooks → Add Webhook**.
2. Set the URL to `https://<your-app>.onrender.com/api/webhooks/paypal`.
3. Tick the events **Invoicing → Invoice paid, cancelled, refunded, updated** (or "All events").
4. Copy the **Webhook ID** into `PAYPAL_WEBHOOK_ID`. KudiDesk then rejects any delivery whose signature PayPal doesn't confirm.

### Try the full payment loop

1. Click **+ New invoice**, paste a chat (or type the details), and use the Personal sandbox email as the client email. Click **Create & send**.
2. Open the row's **Pay link**, log in as the Personal sandbox account and pay.
3. The webhook arrives, and the row turns green with a 💸 toast. No refresh is needed.
4. Log in at [sandbox.paypal.com](https://www.sandbox.paypal.com) as the Business account to see the money.

## Deploy to Render

The repo ships a `render.yaml` Blueprint (free web service, Frankfurt region, health check on `/api/health`).

1. In the Render dashboard, choose **New → Blueprint** and pick this repo.
2. Fill in the secret values when prompted. All of them are optional: leave them empty for demo mode.
3. Once it's live, add the webhook URL in your PayPal sandbox app (step 3 above) and paste the Webhook ID into Render's environment.

Note: the free plan sleeps after inactivity, so the first request can take a little while. The live event feed is kept in memory, which suits a single instance. Invoice data always comes fresh from PayPal.

## API routes

| Method | Route | What it does |
|---|---|---|
| GET | `/api/health` | Mode (demo / paypal), PayPal credential check, AI and webhook status |
| GET | `/api/invoices` | Every invoice as a grid row |
| POST | `/api/invoices` | Create and send a PayPal invoice |
| POST | `/api/invoices/:id/remind` | Send a PayPal reminder with a custom subject and note |
| POST | `/api/ai/extract-invoice` | Chat text → invoice draft (sends nothing) |
| POST | `/api/ai/grid-query` | Question → validated grid filter and sort |
| POST | `/api/ai/chase` | Invoice ids → one tailored reminder draft each (sends nothing) |
| POST | `/api/webhooks/paypal` | PayPal webhook receiver |
| GET | `/api/events?after=n` | Invoice events since `n`, polled by the dashboard |
| POST | `/api/demo/simulate-payment` | Demo mode only: fires a fake PAID webhook through the real handler |

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | empty → demo mode | Sandbox credentials |
| `PAYPAL_API_BASE` | `https://api-m.sandbox.paypal.com` | PayPal API base URL |
| `PAYPAL_WEBHOOK_ID` | empty | Turns on webhook signature verification |
| `GEMINI_API_KEY` | empty → offline AI | Google AI Studio key |
| `GEMINI_MODEL` | `gemini-flash-latest` | Pin a specific Gemini model |
| `FREELANCER_NAME` | empty | Sign-off name used in AI reminders |
| `FX_RATES_NGN` | `{"USD":1500,"GBP":2000,"EUR":1700,"CAD":1100}` | Approximate naira per unit of each currency |

Keep secrets in `.env.local` or Render's environment only. Never commit them.

## License

[MIT](LICENSE)
