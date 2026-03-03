ALTER TABLE public.projects ADD COLUMN debug_trace jsonb DEFAULT NULL;
ALTER TABLE public.projects ADD COLUMN failed_source text DEFAULT NULL;