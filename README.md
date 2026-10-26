# KudiDesk

**AI payments desk for African freelancers — PayPal invoicing + AG Grid + AI agent.**

Since January 2026, Nigerians can receive PayPal payments through Paga. But a freelancer billing several foreign clients still tracks invoices across WhatsApp, email and spreadsheets, and unpaid invoices slip through. KudiDesk puts every invoice and payment in one grid, shows what it's worth in naira, and (coming next) lets AI create invoices from a client chat and chase overdue clients for you.

> Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com) (Oct–Nov 2026).

## Features

| Status | Feature |
|---|---|
| ✅ | Create and send PayPal invoices (Invoicing API v2) to clients in USD, GBP, EUR or CAD |
| ✅ | Every invoice in an AG Grid table — sort, filter, search, status pills, overdue highlighting |
| ✅ | Approximate naira value per invoice, plus Received / Outstanding / Overdue totals |
| ✅ | One-click PayPal payment reminders for unpaid invoices |
| ✅ | Demo mode with sample data — runs with no PayPal keys |
| 🚧 | AI: paste a client chat → invoice drafted automatically |
| 🚧 | AI: ask the grid in plain English ("unpaid UK clients over £200") |
| 🚧 | AI agent: chases overdue clients with tailored reminder notes |
| 🚧 | PayPal webhooks: rows turn green the moment a client pays |

## Tech stack

- **Next.js 15** (App Router, TypeScript) + **Tailwind CSS 4**
- **PayPal REST APIs** (sandbox): OAuth2, Invoicing v2 (create, send, list, remind)
- **AG Grid** (Community) for the invoice workspace
- **Zod** for request validation

## Run it locally

Requires **Node.js 20+**.

```bash
git clone https://github.com/husaynocean/kudidesk.git
cd kudidesk
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000.

- **No keys?** It starts in **Demo data** mode with sample invoices, so you can explore the grid straight away.
- **With PayPal sandbox keys**, it talks to the real PayPal sandbox (see below).

## Connect the PayPal sandbox

1. Sign in at [developer.paypal.com](https://developer.paypal.com) and switch to **Sandbox**.
2. **Apps & Credentials → Sandbox → Create App** (type: Merchant). Copy the **Client ID** and **Secret**.
3. Put them in `.env.local`:
   ```env
   PAYPAL_CLIENT_ID=your-sandbox-client-id
   PAYPAL_CLIENT_SECRET=your-sandbox-secret
   ```
4. Restart `npm run dev` and open http://localhost:3000/api/health. You should see `"paypal": "connected to sandbox ✔"`.
5. In **Testing Tools → Sandbox Accounts**, note a **Personal** account's email and password. That account plays your client.

### Try the full payment loop

1. Click **+ New invoice** and use the Personal sandbox email as the client email.
2. Click **Create & send**. The invoice appears in the grid with a **Pay link**.
3. Open the pay link, log in as the Personal sandbox account and pay.
4. Click **↻** in KudiDesk. The invoice now shows **PAID**.
5. Log in at [sandbox.paypal.com](https://www.sandbox.paypal.com) as the Business account to see the money arrive.

## API routes

| Method | Route | What it does |
|---|---|---|
| GET | `/api/health` | Shows the mode (demo / paypal) and checks the sandbox credentials |
| GET | `/api/invoices` | Lists invoices as grid rows |
| POST | `/api/invoices` | Creates and sends a PayPal invoice |
| POST | `/api/invoices/:id/remind` | Sends a PayPal payment reminder |

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | empty → demo mode | Sandbox credentials |
| `PAYPAL_API_BASE` | `https://api-m.sandbox.paypal.com` | PayPal API base URL |
| `FX_RATES_NGN` | `{"USD":1500,"GBP":2000,"EUR":1700,"CAD":1100}` | Approximate naira per unit of each currency. Update these to today's rates. |

Keep your Secret in `.env.local` only. It is git-ignored, and keys must never be committed.

## License

[MIT](LICENSE)
