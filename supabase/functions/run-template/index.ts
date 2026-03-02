import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error(userError?.message ?? "Not authenticated");
    const user = userData.user;

    const { templateId, inputs } = await req.json();
    if (!templateId) throw new Error("templateId is required");

    // Get template
    const { data: template, error: tplErr } = await supabase
      .from("templates")
      .select("*")
      .eq("id", templateId)
      .single();
    if (tplErr || !template) throw new Error("Template not found");

    const creditCost = template.estimated_credits_per_run;

    // Check credits
    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("credits_balance")
      .eq("user_id", user.id)
      .single();
    if (profErr || !profile) throw new Error("Profile not found");
    if (profile.credits_balance < creditCost) throw new Error("Insufficient credits");

    // Create project
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        template_id: templateId,
        status: "queued",
        inputs: inputs || {},
      })
      .select()
      .single();
    if (projErr) throw new Error(projErr.message);

    // Deduct credits
    await supabase
      .from("profiles")
      .update({ credits_balance: profile.credits_balance - creditCost })
      .eq("user_id", user.id);

    await supabase.from("credit_ledger").insert({
      user_id: user.id,
      type: "run_template",
      amount: -creditCost,
      template_id: templateId,
      project_id: project.id,
      description: `Run template: ${template.name}`,
    });

    // Mark running
    await supabase.from("projects").update({
      status: "running",
      started_at: new Date().toISOString(),
    }).eq("id", project.id);

    // ── AI Image Generation ──
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      await supabase.from("projects").update({
        status: "failed",
        failed_at: new Date().toISOString(),
      }).eq("id", project.id);
      throw new Error("AI service not configured");
    }

    // Build the AI prompt from template
    const aiPrompt = template.ai_prompt || template.description || 
      `Generate a professional ${template.category || "product"} image. Output type: ${template.output_type || "image"}.`;

    // Collect image inputs as base64 for multimodal
    const contentParts: any[] = [];
    const inputSchema: Array<{ key: string; label: string }> = template.input_schema || [];
    
    for (const field of inputSchema) {
      const url = inputs?.[field.key];
      if (url) {
        try {
          console.log(`Fetching input image for ${field.key}...`);
          const imgRes = await fetch(url);
          if (imgRes.ok) {
            const imgBuffer = await imgRes.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(imgBuffer)));
            const contentType = imgRes.headers.get("content-type") || "image/png";
            contentParts.push({
              type: "image_url",
              image_url: { url: `data:${contentType};base64,${base64}` },
            });
            console.log(`Added ${field.key} image (${(imgBuffer.byteLength / 1024).toFixed(0)}KB)`);
          }
        } catch (e) {
          console.warn(`Failed to fetch image for ${field.key}:`, e);
        }
      }
    }

    // Add the text prompt
    contentParts.push({
      type: "text",
      text: aiPrompt,
    });

    console.log(`Calling AI gateway with ${contentParts.length} content parts...`);

    const aiRes = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image-preview",
        messages: [
          {
            role: "system",
            content: "You are a professional product photographer and creative director. Generate high-quality, commercial-grade images based on the provided inputs and instructions. Always output an image.",
          },
          {
            role: "user",
            content: contentParts,
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, errText);
      
      if (aiRes.status === 429) {
        await supabase.from("projects").update({ status: "failed", failed_at: new Date().toISOString() }).eq("id", project.id);
        throw new Error("AI rate limit exceeded. Please try again in a moment.");
      }
      if (aiRes.status === 402) {
        await supabase.from("projects").update({ status: "failed", failed_at: new Date().toISOString() }).eq("id", project.id);
        throw new Error("AI credits exhausted. Please add funds.");
      }
      
      await supabase.from("projects").update({ status: "failed", failed_at: new Date().toISOString() }).eq("id", project.id);
      throw new Error(`AI generation failed: ${aiRes.status}`);
    }

    const aiData = await aiRes.json();
    console.log("AI response received");

    // Extract generated images from the response
    const outputItems: Array<{ type: string; url: string; label: string }> = [];
    const choices = aiData.choices || [];

    for (let i = 0; i < choices.length; i++) {
      const message = choices[i]?.message;
      if (!message?.content) continue;

      // Handle array content (multimodal response with images)
      if (Array.isArray(message.content)) {
        for (let j = 0; j < message.content.length; j++) {
          const part = message.content[j];
          if (part.type === "image_url" && part.image_url?.url) {
            const imageUrl = part.image_url.url;
            // If it's base64, upload to storage
            if (imageUrl.startsWith("data:")) {
              const match = imageUrl.match(/^data:(image\/\w+);base64,(.+)$/);
              if (match) {
                const mimeType = match[1];
                const ext = mimeType.split("/")[1] || "png";
                const b64Data = match[2];
                const bytes = Uint8Array.from(atob(b64Data), c => c.charCodeAt(0));
                const storagePath = `${user.id}/${project.id}/output-${i}-${j}.${ext}`;
                
                const { error: upErr } = await supabase.storage
                  .from("project-assets")
                  .upload(storagePath, bytes, { contentType: mimeType, upsert: true });

                if (upErr) {
                  console.error("Storage upload failed:", upErr);
                } else {
                  const { data: signedData } = await supabase.storage
                    .from("project-assets")
                    .createSignedUrl(storagePath, 86400); // 24h

                  if (signedData?.signedUrl) {
                    outputItems.push({
                      type: "image",
                      url: signedData.signedUrl,
                      label: `Generated ${ext.toUpperCase()} ${outputItems.length + 1}`,
                    });
                  }
                }
              }
            } else {
              // Direct URL
              outputItems.push({
                type: "image",
                url: imageUrl,
                label: `Generated Image ${outputItems.length + 1}`,
              });
            }
          }
        }
      } else if (typeof message.content === "string") {
        // Text-only response — no image generated, store as text output
        console.log("AI returned text (no image):", message.content.substring(0, 200));
      }
    }

    console.log(`Generated ${outputItems.length} output(s)`);

    // Update project with outputs
    const finalStatus = outputItems.length > 0 ? "complete" : "failed";
    await supabase.from("projects").update({
      status: finalStatus,
      outputs: { items: outputItems },
      ...(finalStatus === "complete"
        ? { completed_at: new Date().toISOString() }
        : { failed_at: new Date().toISOString() }),
    }).eq("id", project.id);

    return new Response(
      JSON.stringify({ 
        projectId: project.id, 
        status: finalStatus,
        outputCount: outputItems.length,
        mode: "ai",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("run-template error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
