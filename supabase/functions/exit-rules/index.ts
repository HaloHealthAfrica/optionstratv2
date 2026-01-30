import { corsHeaders } from "../_shared/cors.ts";
import { createDbClient } from "../_shared/db-client.ts";
import { requireAuth } from "../_shared/auth-middleware.ts";

const ALLOWED_FIELDS = new Set([
  "is_active",
  "profit_target_percent",
  "stop_loss_percent",
  "trailing_stop_percent",
  "min_days_to_expiration",
  "max_days_in_trade",
  "delta_exit_threshold",
  "theta_decay_threshold",
  "iv_crush_threshold",
]);

function sanitizePayload(payload: Record<string, unknown>) {
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (ALLOWED_FIELDS.has(key)) {
      updates[key] = value;
    }
  }
  return updates;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const { response } = await requireAuth(req);
  if (response) return response;

  const supabase = createDbClient();
  const url = new URL(req.url);
  const mode = (url.searchParams.get("mode") || "PAPER").toUpperCase();

  if (req.method === "GET") {
    const query = supabase
      .from("exit_rules")
      .select("*")
      .eq("mode", mode)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    const { data, error } = await query;
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ rules: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method === "PUT") {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const updates = sanitizePayload(body);

    if (Object.keys(updates).length === 0) {
      return new Response(JSON.stringify({ error: "No valid fields to update" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existing } = await supabase
      .from("exit_rules")
      .select("id")
      .eq("mode", mode)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    if (existing?.id) {
      const { data, error } = await supabase
        .from("exit_rules")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select("*")
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ rules: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabase
      .from("exit_rules")
      .insert({
        mode,
        is_active: true,
        ...updates,
      })
      .select("*")
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ rules: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
