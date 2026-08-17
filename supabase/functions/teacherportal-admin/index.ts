import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Main Handler ──────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify Supabase auth — this client is scoped to the caller's own
    // session, so `.rpc('is_admin')` runs as them (RLS-governed).
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing auth token" }, 401);
    }

    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: authError,
    } = await callerClient.auth.getUser();

    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // Only admins may perform any action this function offers.
    const { data: isAdmin, error: adminCheckError } = await callerClient.rpc(
      "is_admin"
    );

    if (adminCheckError || isAdmin !== true) {
      return jsonResponse({ error: "Admin access required" }, 403);
    }

    // Privileged client — only ever constructed after confirming the caller
    // is an admin above. The service_role key is auto-provided by Supabase
    // and never leaves this server-side function.
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { action, email, authId, redirectTo } = await req.json();

    // ── ACTION: invite ──────────────────────────────────────────────────────
    if (action === "invite") {
      if (!email) {
        return jsonResponse({ error: "email is required" }, 400);
      }

      // redirectTo must be present in the project's Auth "Redirect URLs"
      // allow-list, or Supabase silently falls back to the Site URL.
      const { data, error } = await adminClient.auth.admin.inviteUserByEmail(
        email,
        redirectTo ? { redirectTo } : undefined
      );

      if (error) {
        return jsonResponse({ error: error.message }, 400);
      }

      return jsonResponse({ success: true, authId: data.user.id });
    }

    // ── ACTION: remove ───────────────────────────────────────────────────
    if (action === "remove") {
      if (!authId) {
        return jsonResponse({ error: "authId is required" }, 400);
      }

      if (authId === user.id) {
        return jsonResponse(
          { error: "You cannot remove your own account" },
          400
        );
      }

      const { error } = await adminClient.auth.admin.deleteUser(authId);

      if (error) {
        return jsonResponse({ error: error.message }, 400);
      }

      return jsonResponse({ success: true });
    }

    return jsonResponse(
      { error: "Invalid action. Use 'invite' or 'remove'." },
      400
    );
  } catch (err) {
    console.error("teacherportal-admin error:", err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
