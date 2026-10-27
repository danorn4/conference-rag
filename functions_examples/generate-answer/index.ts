import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";

Deno.serve(async (req) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    // Verify authenticated user
    const authResult = await requireAuth(req);
    if ("error" in authResult) return authResult.error;

    try {
        const { question, context_talks } = await req.json();

        if (!question || typeof question !== "string") {
            return new Response(
                JSON.stringify({ error: "Missing or invalid 'question' field" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        if (!context_talks || !Array.isArray(context_talks)) {
            return new Response(
                JSON.stringify({ error: "Missing or invalid 'context_talks' field" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const openaiKey = Deno.env.get("OPENAI_API_KEY");
        if (!openaiKey) {
            return new Response(
                JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Build context from the talk data
        const contextText = context_talks
            .map(
                (talk: { title: string; speaker: string; text: string }) =>
                    `"${talk.title}" by ${talk.speaker}:\n${talk.text}`
            )
            .join("\n\n---\n\n");

        const systemPrompt = `You are a helpful assistant that answers questions about General Conference talks from The Church of Jesus Christ of Latter-day Saints. Use ONLY the provided talk excerpts to answer. If the answer isn't found in the excerpts, say so. Cite which talk(s) you're drawing from.`;

        const userPrompt = `Here are relevant talk excerpts:\n\n${contextText}\n\n---\n\nQuestion: ${question}`;

        // Call OpenAI Chat Completions API
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${openaiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "gpt-4o",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                ],
                temperature: 0.3,
                max_tokens: 1024,
            }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            return new Response(
                JSON.stringify({ error: err.error?.message || "OpenAI API error" }),
                { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const data = await response.json();
        const answer = data.choices[0].message.content;

        return new Response(
            JSON.stringify({ answer }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (err) {
        return new Response(
            JSON.stringify({ error: err.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
