import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    // Validate the signed-in user's Supabase JWT before processing the request.
    const authResult = await requireAuth(req);
    if ("error" in authResult) return authResult.error;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Request body must be valid JSON" }, 400);
    }

    const question = (body as { question?: unknown } | null)?.question;
    if (typeof question !== "string" || !question.trim()) {
      return jsonResponse({ error: "Missing or invalid 'question' field" }, 400);
    }
    if (question.length > 8000) {
      return jsonResponse({ error: "Question is too long" }, 400);
    }

    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAiKey) {
      console.error("OPENAI_API_KEY is not configured");
      return jsonResponse({ error: "OPENAI_API_KEY not configured" }, 500);
    }

    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: question.trim(),
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const message = err?.error?.message || "OpenAI API error";
      console.error("OpenAI embedding request failed:", response.status, message);
      return jsonResponse({ error: message }, response.status);
    }

    const result = await response.json();
    const embedding = result?.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) {
      console.error("OpenAI returned an unexpected embedding response");
      return jsonResponse({ error: "Invalid response from OpenAI" }, 502);
    }

    return jsonResponse({ embedding });
  } catch (err) {
    console.error("embed-question failed:", err);
    const message = err instanceof Error ? err.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
