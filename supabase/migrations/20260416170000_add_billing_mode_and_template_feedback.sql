ALTER TABLE public.billing_events
  ADD COLUMN IF NOT EXISTS billing_mode TEXT NOT NULL DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS stripe_livemode BOOLEAN NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'billing_events_billing_mode_check'
  ) THEN
    ALTER TABLE public.billing_events
      ADD CONSTRAINT billing_events_billing_mode_check
      CHECK (billing_mode IN ('live', 'test'));
  END IF;
END $$;

UPDATE public.billing_events
SET
  stripe_livemode = COALESCE(stripe_livemode, true),
  billing_mode = CASE WHEN COALESCE(stripe_livemode, true) THEN 'live' ELSE 'test' END
WHERE billing_mode IS DISTINCT FROM CASE WHEN COALESCE(stripe_livemode, true) THEN 'live' ELSE 'test' END;

ALTER TABLE public.billing_events
  DROP CONSTRAINT IF EXISTS billing_events_stripe_event_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS billing_events_stripe_event_id_mode_key
  ON public.billing_events (stripe_event_id, billing_mode);

CREATE INDEX IF NOT EXISTS idx_billing_events_mode_created_at
  ON public.billing_events (billing_mode, created_at DESC);

CREATE TABLE IF NOT EXISTS public.template_run_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.execution_jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.fuse_templates(id) ON DELETE SET NULL,
  vote TEXT,
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT template_run_feedback_vote_check CHECK (vote IN ('up', 'down') OR vote IS NULL),
  CONSTRAINT template_run_feedback_feedback_required_check CHECK (
    vote IS NOT NULL OR (feedback IS NOT NULL AND btrim(feedback) <> '')
  ),
  CONSTRAINT template_run_feedback_feedback_length_check CHECK (
    feedback IS NULL OR char_length(feedback) <= 1000
  ),
  CONSTRAINT template_run_feedback_user_job_key UNIQUE (user_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_template_run_feedback_job_id
  ON public.template_run_feedback (job_id);

CREATE INDEX IF NOT EXISTS idx_template_run_feedback_user_id
  ON public.template_run_feedback (user_id, updated_at DESC);

ALTER TABLE public.template_run_feedback ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'template_run_feedback'
      AND policyname = 'users_read_own_template_run_feedback'
  ) THEN
    CREATE POLICY "users_read_own_template_run_feedback"
      ON public.template_run_feedback FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'template_run_feedback'
      AND policyname = 'users_insert_own_template_run_feedback'
  ) THEN
    CREATE POLICY "users_insert_own_template_run_feedback"
      ON public.template_run_feedback FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'template_run_feedback'
      AND policyname = 'users_update_own_template_run_feedback'
  ) THEN
    CREATE POLICY "users_update_own_template_run_feedback"
      ON public.template_run_feedback FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'template_run_feedback'
      AND policyname = 'admins_manage_template_run_feedback'
  ) THEN
    CREATE POLICY "admins_manage_template_run_feedback"
      ON public.template_run_feedback FOR ALL
      USING (EXISTS (
        SELECT 1
        FROM public.user_roles r
        WHERE r.user_id = auth.uid() AND r.role = 'admin'
      ));
  END IF;
END $$;

DROP TRIGGER IF EXISTS set_template_run_feedback_updated_at ON public.template_run_feedback;

CREATE TRIGGER set_template_run_feedback_updated_at
  BEFORE UPDATE ON public.template_run_feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
