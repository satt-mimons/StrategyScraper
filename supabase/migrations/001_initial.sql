-- Newsletter Generator MVP schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Single-tenant profile (one row expected for MVP)
CREATE TABLE IF NOT EXISTS profile (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  topics TEXT[] NOT NULL DEFAULT '{}',
  tone_spec TEXT NOT NULL DEFAULT '',
  preferred_pubs TEXT[] NOT NULL DEFAULT ARRAY[
    'semafor.com', 'theinformation.com', 'bloomberg.com', 'cnbc.com',
    'reuters.com', 'wsj.com', 'ft.com', 'axios.com', 'theregister.com'
  ],
  analyst_firms TEXT[] NOT NULL DEFAULT ARRAY[
    'McKinsey', 'BCG', 'Bain', 'Goldman Sachs', 'Morgan Stanley',
    'Barclays', 'Jefferies', 'Deutsche Bank', 'JPMorgan',
    'Gartner', 'IDC', 'Forrester'
  ],
  brand_overrides JSONB DEFAULT '{}',
  recipients TEXT[] NOT NULL DEFAULT '{}',
  reply_to TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'done', 'failed')),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  cost_estimate_usd NUMERIC(10, 4) DEFAULT 0,
  error TEXT,
  lanes_succeeded TEXT[] DEFAULT '{}',
  lanes_failed TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS candidates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  lane TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  author TEXT DEFAULT '',
  published_date TIMESTAMPTZ,
  snippet TEXT DEFAULT '',
  highlights TEXT[] DEFAULT '{}',
  raw_score NUMERIC DEFAULT 0,
  is_paywalled BOOLEAN DEFAULT FALSE,
  platform_post_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_candidates_run_id ON candidates(run_id);
CREATE INDEX IF NOT EXISTS idx_candidates_url ON candidates(url);

CREATE TABLE IF NOT EXISTS sent_urls (
  url TEXT PRIMARY KEY,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sent_urls_sent_at ON sent_urls(sent_at);

CREATE TABLE IF NOT EXISTS newsletters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  html TEXT NOT NULL,
  markdown TEXT NOT NULL DEFAULT '',
  word_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_newsletters_run_id ON newsletters(run_id);

-- Seed default profile if none exists
INSERT INTO profile (company, role, topics, tone_spec, recipients)
SELECT
  '',
  '',
  ARRAY[]::TEXT[],
  'Dry, deadpan, analytically sharp financial-commentary voice in the Matt Levine register. Deadpan understatement; explain serious things plainly, then undercut lightly. The mock-naive move: pretend we cannot see the obvious problem because that is more fun. Willingness to earnestly steelman an absurd thing before puncturing it. Occasional running bits and tangential footnotes. Short, punchy closers. Humor is a delivery layer, never a distortion layer — every factual claim stays accurate and sourced.',
  ARRAY[]::TEXT[]
WHERE NOT EXISTS (SELECT 1 FROM profile LIMIT 1);
