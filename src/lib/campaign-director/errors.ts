/** Provider errors can be pages of JSON with signed links in them. Show people one plain sentence. */
export function friendlyError(raw: string): string {
  const text = String(raw ?? "");
  if (/content_policy_violation|content checker/i.test(text)) {
    return "The model's safety check declined this picture. That is often a false alarm on busy artwork. Re-generate this shot's image and try again, or leave this shot out.";
  }
  return text.replace(/https?:\/\/\S+/g, "[link]").replace(/\s+/g, " ").trim().slice(0, 220);
}
