-- Profile: send frequency + curated source lists (Prompt 1)

ALTER TABLE profile
  ADD COLUMN IF NOT EXISTS frequency TEXT NOT NULL DEFAULT 'weekly'
    CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly')),
  ADD COLUMN IF NOT EXISTS linkedin_urls TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS substack_urls TEXT[] NOT NULL DEFAULT '{}';
