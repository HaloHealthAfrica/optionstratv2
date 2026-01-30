import { corsHeaders } from "../_shared/cors.ts";
import { createDbClient } from "../_shared/db-client.ts";
import { hash, compare } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { create, getNumericDate, verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

interface AuthRequest {
  email: string;
  password: string;
}

async function issueToken(user: { id: string; email: string }) {
  const secret = Deno.env.get("JWT_SECRET");
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );

  return create(
    { alg: "HS256", typ: "JWT" },
    {
      sub: user.id,
      email: user.email,
      exp: getNumericDate(60 * 60 * 24 * 7), // 7 days
    },
    key
  );
}

async function verifyToken(token: string) {
  const secret = Deno.env.get("JWT_SECRET");
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  return verify(token, key);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.replace("Bearer ", "") : null;

    if (action === "me" && req.method === "GET") {
      if (!token) {
        return new Response(JSON.stringify({ error: "Missing token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const payload = await verifyToken(token);
      const userId = typeof payload.sub === "string" ? payload.sub : null;
      const email = typeof payload.email === "string" ? payload.email : null;
      if (!userId || !email) {
        return new Response(JSON.stringify({ error: "Invalid token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ user: { id: userId, email } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as AuthRequest;

    if (!body.email || !body.password) {
      return new Response(JSON.stringify({ error: "Email and password required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const email = body.email.trim().toLowerCase();
    const supabase = createDbClient();

    if (action === "register") {
      const { data: existing } = await supabase
        .from("app_users")
        .select("id")
        .eq("email", email)
        .single();

      if (existing) {
        return new Response(JSON.stringify({ error: "Email already registered" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const passwordHash = await hash(body.password, 10);
      const { data: user, error } = await supabase
        .from("app_users")
        .insert({
          email,
          password_hash: passwordHash,
        })
        .select("*")
        .single();

      if (error || !user) {
        throw new Error(error?.message || "Failed to create user");
      }

      const token = await issueToken({ id: user.id, email: user.email });
      return new Response(JSON.stringify({ token, user: { id: user.id, email: user.email } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "login") {
      const { data: user } = await supabase
        .from("app_users")
        .select("*")
        .eq("email", email)
        .single();

      if (!user || !user.password_hash) {
        return new Response(JSON.stringify({ error: "Invalid credentials" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const valid = await compare(body.password, user.password_hash);
      if (!valid) {
        return new Response(JSON.stringify({ error: "Invalid credentials" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const token = await issueToken({ id: user.id, email: user.email });
      await supabase
        .from("app_users")
        .update({ last_login_at: new Date().toISOString() })
        .eq("id", user.id);

      return new Response(JSON.stringify({ token, user: { id: user.id, email: user.email } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Auth] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
