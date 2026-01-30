import { corsHeaders } from "./cors.ts";
import { verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

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
  const expectedToken = Deno.env.get("API_AUTH_TOKEN");
  if (expectedToken && token === expectedToken) {
    return { user: { id: "api-token" }, error: null };
  }

  const jwtSecret = Deno.env.get("JWT_SECRET");
  if (!jwtSecret) {
    return { user: null, error: "JWT_SECRET not configured" };
  }

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(jwtSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const payload = await verify(token, key);
    const userId = typeof payload.sub === "string" ? payload.sub : "unknown";
    const email = typeof payload.email === "string" ? payload.email : undefined;
    return { user: { id: userId, email }, error: null };
  } catch (_error) {
    return { user: null, error: "Invalid token" };
  }
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
  if (!Deno.env.get("API_AUTH_TOKEN") && !Deno.env.get("JWT_SECRET")) {
    return { user: { id: "anonymous" } };
  }

  const { user, error } = await validateAuth(req);
  
  if (!user) {
    return { user: null, response: unauthorizedResponse(error || "Unauthorized") };
  }
  
  return { user };
}
