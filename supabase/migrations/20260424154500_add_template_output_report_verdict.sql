ALTER TABLE public.template_output_reports
  ADD COLUMN IF NOT EXISTS verdict TEXT NOT NULL DEFAULT 'iffy';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'template_output_reports_verdict_check'
      AND conrelid = 'public.template_output_reports'::regclass
  ) THEN
    ALTER TABLE public.template_output_reports
      ADD CONSTRAINT template_output_reports_verdict_check
      CHECK (verdict IN ('good', 'iffy', 'bad'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_template_output_reports_verdict
  ON public.template_output_reports (verdict, status, updated_at DESC);
