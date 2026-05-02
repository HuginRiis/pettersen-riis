ALTER TABLE public.changelog_entries
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'code'
    CHECK (category IN ('code','app'));

CREATE INDEX IF NOT EXISTS idx_changelog_entries_category
  ON public.changelog_entries(category);