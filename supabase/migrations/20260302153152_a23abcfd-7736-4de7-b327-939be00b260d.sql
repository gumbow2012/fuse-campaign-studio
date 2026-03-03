-- Add AI prompt field so templates can define what the AI should generate
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS ai_prompt text;

-- Add comment explaining usage
COMMENT ON COLUMN public.templates.ai_prompt IS 'Prompt template for AI image generation. Supports {input_key} placeholders.';
const { data } = await supabase.auth.getSession()
data.session.access_token
