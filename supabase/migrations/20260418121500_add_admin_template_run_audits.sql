CREATE TABLE IF NOT EXISTS public.template_run_admin_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.execution_jobs(id) ON DELETE CASCADE,
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.fuse_templates(id) ON DELETE SET NULL,
  version_id UUID REFERENCES public.template_versions(id) ON DELETE SET NULL,
  verdict TEXT NOT NULL DEFAULT 'needs_work',
  overall_score INTEGER NOT NULL DEFAULT 0,
  output_quality_score INTEGER NOT NULL DEFAULT 3,
  brand_alignment_score INTEGER NOT NULL DEFAULT 3,
  prompt_adherence_score INTEGER NOT NULL DEFAULT 3,
  input_fidelity_score INTEGER NOT NULL DEFAULT 3,
  failure_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  automation_flags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  summary TEXT NOT NULL,
  keepers TEXT,
  change_request TEXT,
  prompt_to_output_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT template_run_admin_audits_admin_job_key UNIQUE (admin_user_id, job_id),
  CONSTRAINT template_run_admin_audits_verdict_check CHECK (
    verdict IN ('approved', 'needs_work', 'blocked', 'critical')
  ),
  CONSTRAINT template_run_admin_audits_overall_score_check CHECK (
    overall_score BETWEEN 0 AND 100
  ),
  CONSTRAINT template_run_admin_audits_output_quality_score_check CHECK (
    output_quality_score BETWEEN 1 AND 5
  ),
  CONSTRAINT template_run_admin_audits_brand_alignment_score_check CHECK (
    brand_alignment_score BETWEEN 1 AND 5
  ),
  CONSTRAINT template_run_admin_audits_prompt_adherence_score_check CHECK (
    prompt_adherence_score BETWEEN 1 AND 5
  ),
  CONSTRAINT template_run_admin_audits_input_fidelity_score_check CHECK (
    input_fidelity_score BETWEEN 1 AND 5
  ),
  CONSTRAINT template_run_admin_audits_summary_length_check CHECK (
    char_length(btrim(summary)) BETWEEN 1 AND 3000
  ),
  CONSTRAINT template_run_admin_audits_keepers_length_check CHECK (
    keepers IS NULL OR char_length(keepers) <= 3000
  ),
  CONSTRAINT template_run_admin_audits_change_request_length_check CHECK (
    change_request IS NULL OR char_length(change_request) <= 3000
  ),
  CONSTRAINT template_run_admin_audits_prompt_to_output_notes_length_check CHECK (
    prompt_to_output_notes IS NULL OR char_length(prompt_to_output_notes) <= 3000
  )
);

CREATE INDEX IF NOT EXISTS idx_template_run_admin_audits_job_id
  ON public.template_run_admin_audits (job_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_template_run_admin_audits_template_id
  ON public.template_run_admin_audits (template_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_template_run_admin_audits_verdict
  ON public.template_run_admin_audits (verdict, updated_at DESC);

ALTER TABLE public.template_run_admin_audits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'template_run_admin_audits'
      AND policyname = 'admins_read_template_run_admin_audits'
  ) THEN
    CREATE POLICY "admins_read_template_run_admin_audits"
      ON public.template_run_admin_audits FOR SELECT
      USING (EXISTS (
        SELECT 1
        FROM public.user_roles r
        WHERE r.user_id = auth.uid() AND r.role = 'admin'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'template_run_admin_audits'
      AND policyname = 'admins_insert_own_template_run_admin_audits'
  ) THEN
    CREATE POLICY "admins_insert_own_template_run_admin_audits"
      ON public.template_run_admin_audits FOR INSERT
      WITH CHECK (
        auth.uid() = admin_user_id
        AND EXISTS (
          SELECT 1
          FROM public.user_roles r
          WHERE r.user_id = auth.uid() AND r.role = 'admin'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'template_run_admin_audits'
      AND policyname = 'admins_update_own_template_run_admin_audits'
  ) THEN
    CREATE POLICY "admins_update_own_template_run_admin_audits"
      ON public.template_run_admin_audits FOR UPDATE
      USING (
        auth.uid() = admin_user_id
        AND EXISTS (
          SELECT 1
          FROM public.user_roles r
          WHERE r.user_id = auth.uid() AND r.role = 'admin'
        )
      )
      WITH CHECK (
        auth.uid() = admin_user_id
        AND EXISTS (
          SELECT 1
          FROM public.user_roles r
          WHERE r.user_id = auth.uid() AND r.role = 'admin'
        )
      );
  END IF;
END $$;

DROP TRIGGER IF EXISTS set_template_run_admin_audits_updated_at ON public.template_run_admin_audits;

CREATE TRIGGER set_template_run_admin_audits_updated_at
  BEFORE UPDATE ON public.template_run_admin_audits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
