# Newsletter Generator

A single-tenant MVP that generates personalized newsletters on demand using a multi-agent research pipeline.

## Architecture

```
Generate Now → CHIEF (orchestrator)
  ├── News (Exa)
  ├── Analyst (Exa, triple-pass: news coverage + firm-name + primary firm domains)
  ├── Substack (Exa, dual-pass)
  ├── Medium (Exa, dual-pass)
  ├── X (Apify)
  └── LinkedIn (Apify, best-effort)
       ↓
  Candidate Pool (Supabase)
       ↓
  Filter → Cluster (§8.5) → Reporter → Editor → Design → Resend
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env.local` and fill in:

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `EXA_API_KEY` | Exa search API key |
| `APIFY_TOKEN` | Apify API token |
| `RESEND_API_KEY` | Resend email API key |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `RESEND_FROM_EMAIL` | Verified sending domain email |
| `RESEND_FROM_NAME` | Display name for sender |
| `RESEND_REPLY_TO` | Default reply-to address |

### 3. Run database migration

Apply migrations in order in your Supabase SQL editor (`001` → `004`).

### 4. Start dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Usage

1. Fill in your profile: company, role, topics, recipients.
2. Click **Save Profile**.
3. Click **Generate Now** — the pipeline runs in the background (2–5 minutes).
4. Check your inbox for the branded newsletter.

## Deploy to Vercel

```bash
npx vercel
```

Set all env vars in the Vercel dashboard. The generate route uses `maxDuration = 300` for extended pipeline runs.

## Cost Controls

Each run is capped at ~$5 USD. If projected cost exceeds the cap, the run stops and flags an error. Cost estimates are tracked per run in the `runs` table.

## Deferred Features

Clean seams left for future work:
- Multi-user auth (Supabase Auth + Google OAuth)
- Autonomous scheduling (cron + queue + worker)
- Send-from-user's-Gmail
- Public web archive page
- Exa `deep` research mode
