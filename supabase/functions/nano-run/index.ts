import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, images } = await req.json();
    if (!prompt) {
      return new Response(JSON.stringify({ error: "prompt is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Build user message content parts
    const contentParts: any[] = [];

    // Add images if provided (as base64 data URIs)
    if (images && Array.isArray(images)) {
      for (const img of images) {
        contentParts.push({
          type: "image_url",
          image_url: { url: img }, // expects data:image/...;base64,...
        });
      }
    }

    // Add the text prompt
    contentParts.push({ type: "text", text: prompt });

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [
            {
              role: "system",
              content:
                "You are an image generation assistant. Generate the requested image based on the user's prompt and any reference images provided. Always output an image.",
            },
            { role: "user", content: contentParts },
          ],
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Add funds to your Lovable workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(
        JSON.stringify({ error: `AI gateway error (${response.status})` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log("AI response structure:", JSON.stringify(data).slice(0, 500));

    // Extract image from response — could be in various formats
    const choice = data.choices?.[0];
    const content = choice?.message?.content;

    // If content is a string, it might contain a markdown image or base64
    // If it's an array, look for image parts
    let outputImage: string | null = null;

    if (typeof content === "string") {
      // Check for base64 data URI
      const dataUriMatch = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
      if (dataUriMatch) {
        outputImage = dataUriMatch[0];
      }
      // Check for markdown image
      const mdMatch = content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
      if (!outputImage && mdMatch) {
        outputImage = mdMatch[1];
      }
      // If no image found, return the text
      if (!outputImage) {
        return new Response(
          JSON.stringify({ error: "Model returned text only", text: content.slice(0, 500) }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (Array.isArray(content)) {
      for (const part of content) {
        if (part.type === "image_url") {
          outputImage = part.image_url?.url;
          break;
        }
      }
    }

    if (!outputImage) {
      return new Response(
        JSON.stringify({ error: "No image in response", raw: JSON.stringify(data).slice(0, 500) }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, outputUrl: outputImage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("nano-run error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
