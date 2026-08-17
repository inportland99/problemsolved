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

// Sends a custom invite email containing both the clickable link and the
// 6-digit OTP code, via the Resend API directly. Used for both the initial
// invite and any resends, so both flows always include a code fallback
// regardless of whether the link survives email security scanning.
async function sendInviteEmail(
  email: string,
  linkData: { properties?: { action_link?: string; email_otp?: string } } | null
): Promise<{ error?: string }> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    return { error: "RESEND_API_KEY is not configured for this function" };
  }

  const actionLink = linkData?.properties?.action_link;
  const emailOtp = linkData?.properties?.email_otp;
  if (!actionLink && !emailOtp) {
    return { error: "Failed to generate a new invite link" };
  }

  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: "Teacher Portal <noreply@drrajshah.com>",
      to: email,
      subject: "You've been invited to the Teacher Portal",
      html: `
        <p>You have been invited to create a Teacher Portal account.</p>
        ${actionLink ? `<p><a href="${actionLink}">Accept the invite</a></p>` : ""}
        ${emailOtp ? `<p>If the link above doesn't work, go to the portal's set-password page and enter this code instead: <strong style="font-size:1.4em; letter-spacing:0.1em;">${emailOtp}</strong></p>` : ""}
        <p>If you weren't expecting this, you can ignore this email.</p>
      `,
    }),
  });

  if (!emailRes.ok) {
    const errText = await emailRes.text();
    return { error: `Failed to send invite email: ${errText}` };
  }

  return {};
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
    // ── ACTION: resend ──────────────────────────────────────────────
    // Both share the same underlying mechanism: generateLink creates (or
    // re-tokenizes, for an existing unconfirmed user) the invite and returns
    // a link plus a 6-digit OTP code, which we email ourselves via the
    // Resend API so both a link click and manual code entry are supported.
    if (action === "invite" || action === "resend") {
      if (!email) {
        return jsonResponse({ error: "email is required" }, 400);
      }

      // redirectTo must be present in the project's Auth "Redirect URLs"
      // allow-list, or Supabase silently falls back to the Site URL.
      const { data: linkData, error: linkError } =
        await adminClient.auth.admin.generateLink({
          type: "invite",
          email,
          options: redirectTo ? { redirectTo } : undefined,
        });

      if (linkError) {
        return jsonResponse({ error: linkError.message }, 400);
      }

      const sendResult = await sendInviteEmail(email, linkData);
      if (sendResult.error) {
        return jsonResponse({ error: sendResult.error }, 500);
      }

      if (action === "invite") {
        const newAuthId = linkData?.user?.id;
        if (!newAuthId) {
          return jsonResponse(
            { error: "Invite email sent, but no user id was returned" },
            500
          );
        }
        return jsonResponse({ success: true, authId: newAuthId });
      }

      return jsonResponse({ success: true });
    }

    // ── ACTION: remove ──────────────────────────────────────────────────────
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
      { error: "Invalid action. Use 'invite', 'resend', or 'remove'." },
      400
    );
  } catch (err) {
    console.error("teacherportal-admin error:", err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
