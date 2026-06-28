-- Analyst firm domain watchlist (§17) — drives includeDomains on primary thought-leadership pass
ALTER TABLE profile
  ADD COLUMN IF NOT EXISTS analyst_firm_domains TEXT[] NOT NULL DEFAULT ARRAY[
    'bain.com',
    'mckinsey.com',
    'bcg.com',
    'gartner.com',
    'forrester.com',
    'idc.com',
    'hfsresearch.com'
  ];
