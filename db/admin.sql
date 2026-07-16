-- Admin area schema: feature flags, usage events, soft-disable users, waitlist

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_disabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS seats integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS assistant_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.plan_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  plan text NOT NULL,
  seats integer NOT NULL DEFAULT 1,
  max_redemptions integer NOT NULL DEFAULT 1,
  redemption_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plan_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id uuid NOT NULL REFERENCES public.plan_codes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plan text NOT NULL,
  seats integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code_id, user_id)
);

ALTER TABLE public.plan_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_redemptions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.feature_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  feature text NOT NULL,
  action text NOT NULL DEFAULT 'use',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feature_usage_events_feature_created_idx
  ON public.feature_usage_events (feature, created_at DESC);

CREATE INDEX IF NOT EXISTS feature_usage_events_user_created_idx
  ON public.feature_usage_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS feature_usage_events_created_idx
  ON public.feature_usage_events (created_at DESC);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_usage_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.waitlist_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  source text NOT NULL DEFAULT 'landing',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT waitlist_signups_email_unique UNIQUE (email)
);

ALTER TABLE public.waitlist_signups ENABLE ROW LEVEL SECURITY;

INSERT INTO public.app_settings (key, value)
VALUES (
  'feature_flags',
  jsonb_build_object(
    'integrations', jsonb_build_object(
      'gmail', true,
      'whatsapp', true,
      'slack', true,
      'outlook', true,
      'discord', true,
      'linkedin', true,
      'calendly', true
    ),
    'surfaces', jsonb_build_object(
      'aiAgent', true,
      'alerts', true,
      'briefing', true,
      'inbox', true
    )
  )
)
ON CONFLICT (key) DO NOTHING;
