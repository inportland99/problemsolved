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

// ─── Google Auth ───────────────────────────────────────────────────────────────

async function getGoogleAccessToken(): Promise<string> {
  const email = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL")!;
  const privateKeyPem = Deno.env.get("GOOGLE_PRIVATE_KEY")!.replace(
    /\\n/g,
    "\n"
  );

  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  const unsignedToken = `${encode(header)}.${encode(payload)}`;

  const pemBody = privateKeyPem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const jwt = `${unsignedToken}.${sig}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Google token exchange failed: ${err}`);
  }

  const { access_token } = await tokenRes.json();
  return access_token;
}

// ─── Google Sheets ─────────────────────────────────────────────────────────────

interface SheetRow {
  timestamp: string;
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

function parseName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

async function fetchSheetRows(accessToken: string): Promise<SheetRow[]> {
  const sheetId = Deno.env.get("GOOGLE_SHEET_ID")!;
  const range = encodeURIComponent("A:D");
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Sheets API error: ${err}`);
  }

  const data = await res.json();
  const rows: string[][] = data.values || [];

  return rows.slice(1).map((row) => {
    const fullName = (row[1] || "").trim();
    const { firstName, lastName } = parseName(fullName);
    return {
      timestamp: (row[0] || "").trim(),
      fullName,
      firstName,
      lastName,
      email: (row[2] || "").trim(),
      role: (row[3] || "").trim(),
    };
  });
}

function filterByTimestamp(
  rows: SheetRow[],
  startTime: string,
  endTime: string
): SheetRow[] {
  const start = new Date(startTime);
  const end = new Date(endTime);

  return rows.filter((row) => {
    if (!row.timestamp) return false;
    const ts = new Date(row.timestamp);
    return !isNaN(ts.getTime()) && ts >= start && ts <= end;
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

async function getOrCreateTag(
  name: string,
  apiKey: string
): Promise<number> {
  const res = await kitFetch("/tags", "POST", apiKey, { name });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kit create tag "${name}" failed: ${err}`);
  }
  const data = await res.json();
  return data.tag.id;
}

async function createSubscriber(
  email: string,
  firstName: string,
  lastName: string,
  apiKey: string
): Promise<void> {
  const body: Record<string, unknown> = {
    email_address: email,
    first_name: firstName,
  };

  if (lastName) {
    body.fields = { "Last Name": lastName };
  }

  const res = await kitFetch("/subscribers", "POST", apiKey, body);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kit create subscriber ${email} failed: ${err}`);
  }
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

    const { action, startTime, endTime, tagName, selectedRows, mainTagId: passedMainTagId, roleTagIds: passedRoleTagIds, roles } =
      await req.json();

    // ── ACTION: preview ──────────────────────────────────────────────────
    if (action === "preview") {
      if (!startTime || !endTime) {
        return jsonResponse(
          { error: "startTime and endTime are required" },
          400
        );
      }

      const googleToken = await getGoogleAccessToken();
      const allRows = await fetchSheetRows(googleToken);
      const matchedRows = filterByTimestamp(allRows, startTime, endTime);

      return jsonResponse({ rows: matchedRows });
    }

    // ── ACTION: resolve-tags ────────────────────────────────────────────
    if (action === "resolve-tags") {
      if (!tagName) {
        return jsonResponse({ error: "tagName is required" }, 400);
      }

      const kitApiKey = Deno.env.get("KIT_API_KEY")!;
      const mainTagId = await getOrCreateTag(tagName, kitApiKey);

      const roleTagIds: Record<string, number> = {};
      const roleList = (roles as string[]) || [];
      for (const role of roleList) {
        roleTagIds[role] = await getOrCreateTag(role, kitApiKey);
      }

      return jsonResponse({ mainTagId, roleTagIds });
    }

    // ── ACTION: import ───────────────────────────────────────────────────
    if (action === "import") {
      if (!selectedRows || selectedRows.length === 0 || !passedMainTagId) {
        return jsonResponse(
          { error: "selectedRows and mainTagId are required" },
          400
        );
      }

      const kitApiKey = Deno.env.get("KIT_API_KEY")!;
      const mainTagId = passedMainTagId as number;
      const roleTagIds = (passedRoleTagIds || {}) as Record<string, number>;

      // Import each subscriber
      let imported = 0;
      const errors: string[] = [];
      const failedRows: SheetRow[] = [];

      for (let i = 0; i < (selectedRows as SheetRow[]).length; i++) {
        const row = (selectedRows as SheetRow[])[i];

        if (!row.email) {
          errors.push(
            `Skipped row with empty email (name: "${row.fullName}")`
          );
          continue;
        }

        try {
          await createSubscriber(
            row.email,
            row.firstName,
            row.lastName,
            kitApiKey
          );

          await tagSubscriber(mainTagId, row.email, kitApiKey);

          if (row.role && roleTagIds[row.role]) {
            await tagSubscriber(roleTagIds[row.role], row.email, kitApiKey);
          }

          imported++;
        } catch (err) {
          const msg = (err as Error).message;
          if (msg.includes("Retry later")) {
            // Rate-limited — mark for frontend retry
            failedRows.push(row);
          } else {
            errors.push(`${row.email}: ${msg}`);
          }
        }
      }

      return jsonResponse({
        totalFound: selectedRows.length,
        imported,
        tagName,
        errors,
        failedRows,
      });
    }

    return jsonResponse(
      { error: "Invalid action. Use 'preview' or 'import'." },
      400
    );
  } catch (err) {
    console.error("import-to-kit error:", err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
