import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";

/**
 * Manual authentication for Edge Functions.
 *
 * WHY THIS EXISTS:
 * Supabase Auth now issues ES256 (asymmetric) JWTs, but the Edge Function
 * API gateway can only verify HS256 (symmetric) JWTs. This causes valid
 * session tokens to be rejected with 401 "Invalid JWT" at the gateway level.
 *
 * WORKAROUND:
 * We disable gateway JWT verification (verify_jwt = false in config.toml)
 * and instead verify the user here using supabase.auth.getUser(), which
 * correctly handles ES256 tokens via the Supabase Auth service.
 *
 * TRACKING:
 * - https://github.com/supabase/supabase/issues/32364
 * - https://github.com/supabase/supabase/issues/31987
 * - Legacy HS256 keys expected to be deprecated late 2026
 *
 * Returns the user object if valid, or a 401 Response if not.
 */
export async function requireAuth(req: Request): Promise<
    { user: { id: string; email?: string } } | { error: Response }
> {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
        return {
            error: new Response(
                JSON.stringify({ error: "Missing Authorization header" }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            ),
        };
    }

    const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        {
            global: { headers: { Authorization: authHeader } },
        }
    );

    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        return {
            error: new Response(
                JSON.stringify({ error: "Invalid or expired token" }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            ),
        };
    }

    return { user };
}
