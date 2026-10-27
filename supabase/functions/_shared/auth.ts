import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";

/**
 * Validate the caller's session with Supabase Auth. This manual check is used
 * because deployment uses --no-verify-jwt for newer asymmetric JWTs.
 */
export async function requireAuth(req: Request): Promise<
  { user: { id: string; email?: string } } | { error: Response }
> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return {
      error: new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      ),
    };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    console.error("Supabase Auth environment is not configured");
    return {
      error: new Response(
        JSON.stringify({ error: "Authentication service is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      ),
    };
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return {
      error: new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      ),
    };
  }

  return { user };
}
