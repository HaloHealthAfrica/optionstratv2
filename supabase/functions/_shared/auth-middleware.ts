import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";

export interface AuthResult {
  user: { id: string; email?: string } | null;
  error: string | null;
}

/**
 * Validates the Authorization header and returns the authenticated user.
 * Returns null user if no valid auth is present.
 */
export async function validateAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization");
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { user: null, error: "Missing or invalid Authorization header" };
  }

  const token = authHeader.replace("Bearer ", "");
  
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data, error } = await supabase.auth.getUser(token);
  
  if (error || !data.user) {
    return { user: null, error: error?.message || "Invalid token" };
  }

  return { 
    user: { 
      id: data.user.id, 
      email: data.user.email 
    }, 
    error: null 
  };
}

/**
 * Returns a 401 Unauthorized response with proper CORS headers.
 */
export function unauthorizedResponse(message: string = "Unauthorized"): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { 
      status: 401, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    }
  );
}

/**
 * Middleware helper that validates auth and returns early if unauthorized.
 * For endpoints that require authentication.
 */
export async function requireAuth(req: Request): Promise<{ user: AuthResult["user"]; response?: Response }> {
  const { user, error } = await validateAuth(req);
  
  if (!user) {
    return { user: null, response: unauthorizedResponse(error || "Unauthorized") };
  }
  
  return { user };
}
