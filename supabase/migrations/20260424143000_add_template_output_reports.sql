CREATE TABLE IF NOT EXISTS public.template_output_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.execution_jobs(id) ON DELETE CASCADE,
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.fuse_templates(id) ON DELETE SET NULL,
  version_id UUID REFERENCES public.template_versions(id) ON DELETE SET NULL,
  output_number INTEGER NOT NULL,
  output_url TEXT,
  issue_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  severity TEXT NOT NULL DEFAULT 'medium',
  note TEXT NOT NULL,
  recommended_fix TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT template_output_reports_admin_job_output_key UNIQUE (admin_user_id, job_id, output_number),
  CONSTRAINT template_output_reports_output_number_check CHECK (output_number > 0),
  CONSTRAINT template_output_reports_severity_check CHECK (severity IN ('low', 'medium', 'high', 'blocking')),
  CONSTRAINT template_output_reports_status_check CHECK (status IN ('open', 'fixed', 'wont_fix')),
  CONSTRAINT template_output_reports_note_length_check CHECK (char_length(btrim(note)) BETWEEN 1 AND 2000),
  CONSTRAINT template_output_reports_recommended_fix_length_check CHECK (recommended_fix IS NULL OR char_length(recommended_fix) <= 2000)
);

CREATE INDEX IF NOT EXISTS idx_template_output_reports_job_id
  ON public.template_output_reports (job_id, output_number, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_template_output_reports_template_id
  ON public.template_output_reports (template_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_template_output_reports_status
  ON public.template_output_reports (status, severity, updated_at DESC);

ALTER TABLE public.template_output_reports ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'template_output_reports'
      AND policyname = 'admins_read_template_output_reports'
  ) THEN
    CREATE POLICY "admins_read_template_output_reports"
      ON public.template_output_reports FOR SELECT
      USING (EXISTS (
        SELECT 1 FROM public.user_roles r
        WHERE r.user_id = auth.uid() AND r.role = 'admin'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'template_output_reports'
      AND policyname = 'admins_insert_own_template_output_reports'
  ) THEN
    CREATE POLICY "admins_insert_own_template_output_reports"
      ON public.template_output_reports FOR INSERT
      WITH CHECK (
        auth.uid() = admin_user_id
        AND EXISTS (
          SELECT 1 FROM public.user_roles r
          WHERE r.user_id = auth.uid() AND r.role = 'admin'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'template_output_reports'
      AND policyname = 'admins_update_own_template_output_reports'
  ) THEN
    CREATE POLICY "admins_update_own_template_output_reports"
      ON public.template_output_reports FOR UPDATE
      USING (
        auth.uid() = admin_user_id
        AND EXISTS (
          SELECT 1 FROM public.user_roles r
          WHERE r.user_id = auth.uid() AND r.role = 'admin'
        )
      )
      WITH CHECK (
        auth.uid() = admin_user_id
        AND EXISTS (
          SELECT 1 FROM public.user_roles r
          WHERE r.user_id = auth.uid() AND r.role = 'admin'
        )
      );
  END IF;
END $$;

DROP TRIGGER IF EXISTS set_template_output_reports_updated_at ON public.template_output_reports;

CREATE TRIGGER set_template_output_reports_updated_at
  BEFORE UPDATE ON public.template_output_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
