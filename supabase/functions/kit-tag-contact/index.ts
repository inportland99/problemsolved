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

// ─── Kit.com API ───────────────────────────────────────────────────────────────

const KIT_BASE = "https://api.kit.com/v4";

async function kitFetch(
  path: string,
  method: string,
  apiKey: string,
  body?: unknown
): Promise<Response> {
  const opts: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Kit-Api-Key": apiKey,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  return fetch(`${KIT_BASE}${path}`, opts);
}

async function getOrCreateTag(name: string, apiKey: string): Promise<number> {
  const res = await kitFetch("/tags", "POST", apiKey, { name });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kit create/get tag "${name}" failed: ${err}`);
  }
  const data = await res.json();
  return data.tag.id;
}

async function tagSubscriber(
  tagId: number,
  email: string,
  apiKey: string
): Promise<void> {
  const res = await kitFetch(`/tags/${tagId}/subscribers`, "POST", apiKey, {
    email_address: email,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(
      `Kit tag subscriber ${email} (tag ${tagId}) failed: ${err}`
    );
  }
}

// ─── Main Handler ──────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify Supabase auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing auth token" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { email, tagName = "PD Interest" } = await req.json();

    if (!email) {
      return jsonResponse({ error: "email is required" }, 400);
    }

    const kitApiKey = Deno.env.get("KIT_API_KEY");
    if (!kitApiKey) {
      return jsonResponse({ error: "KIT_API_KEY is not configured" }, 500);
    }

    const tagId = await getOrCreateTag(tagName, kitApiKey);
    await tagSubscriber(tagId, email, kitApiKey);

    return jsonResponse({ success: true, email, tagName });
  } catch (err) {
    console.error("kit-tag-contact error:", err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
