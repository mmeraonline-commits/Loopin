-- Auto-draft confirm queue (apply on InsForge if not already present)
ALTER TABLE public.alerts
  ADD COLUMN IF NOT EXISTS draft_reply text,
  ADD COLUMN IF NOT EXISTS draft_status text,
  ADD COLUMN IF NOT EXISTS drafted_at timestamptz,
  ADD COLUMN IF NOT EXISTS draft_tone text;

CREATE INDEX IF NOT EXISTS alerts_user_draft_status_idx
  ON public.alerts (user_id, draft_status)
  WHERE draft_status IS NOT NULL;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS assistant_settings jsonb NOT NULL DEFAULT '{}'::jsonb;
