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

interface ColumnData {
  header: string;
  responses: string[];
}

interface RowContact {
  name: string;
  email: string;
}

interface SheetData {
  columns: ColumnData[];
  /** Contact info per filtered row index, aligned with response order */
  contacts: RowContact[];
}

async function fetchSurveyColumns(
  accessToken: string,
  startTime: string,
  endTime: string
): Promise<SheetData> {
  const sheetId = Deno.env.get("GOOGLE_SHEET_ID")!;

  // Fetch columns A (timestamp), B (name), C (email), and E:K
  const ranges = ["A:A", "B:B", "C:C", "E:K"]
    .map(encodeURIComponent)
    .join("&ranges=");
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchGet?ranges=${ranges}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Sheets API error: ${err}`);
  }

  const data = await res.json();
  const [tsRange, nameRange, emailRange, dataRange] = data.valueRanges;

  const tsRows: string[][] = tsRange.values || [];
  const nameRows: string[][] = nameRange.values || [];
  const emailRows: string[][] = emailRange.values || [];
  const dataRows: string[][] = dataRange.values || [];

  if (tsRows.length === 0 || dataRows.length === 0) {
    return { columns: [], contacts: [] };
  }

  // Row 0 is the header
  const headers = dataRows[0] || [];

  // Parse timestamp filter bounds
  const start = new Date(startTime);
  const end = new Date(endTime);

  // Build filtered indices (skip header row 0)
  const filteredIndices: number[] = [];
  for (let i = 1; i < tsRows.length; i++) {
    const raw = (tsRows[i]?.[0] || "").trim();
    if (!raw) continue;
    const ts = new Date(raw);
    if (!isNaN(ts.getTime()) && ts >= start && ts <= end) {
      filteredIndices.push(i);
    }
  }

  // Collect contact info for filtered rows
  const contacts: RowContact[] = filteredIndices.map((rowIdx) => ({
    name: (nameRows[rowIdx]?.[0] || "").trim(),
    email: (emailRows[rowIdx]?.[0] || "").trim(),
  }));

  // Collect responses per column — keep ALL rows (including empty) so that
  // responses[i] is always aligned with contacts[i] for every column.
  const columns: ColumnData[] = headers.map((header, colIdx) => {
    const responses: string[] = filteredIndices.map((rowIdx) =>
      (dataRows[rowIdx]?.[colIdx] || "").trim()
    );
    return { header: header.trim(), responses };
  });

  return { columns, contacts };
}

// ─── Analysis helpers ──────────────────────────────────────────────────────────

// Column indices within the E:K range (0-based)
const COL_F_INDEX = 1; // Accountability partner — skip
const COL_G_INDEX = 2; // 1-10 rating — five-number summary
const COL_H_INDEX = 3; // Positive feedback — summary + testimonials
const COL_I_INDEX = 4; // Improvements — summary + top suggestions
const COL_J_INDEX = 5; // Additional comments — summary + school/district invitations

function fiveNumberSummary(values: number[]): {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  mean: number;
  count: number;
} {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;

  function percentile(p: number): number {
    const idx = (p / 100) * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  const mean = values.reduce((a, b) => a + b, 0) / n;

  return {
    min: sorted[0],
    q1: Math.round(percentile(25) * 100) / 100,
    median: Math.round(percentile(50) * 100) / 100,
    q3: Math.round(percentile(75) * 100) / 100,
    max: sorted[n - 1],
    mean: Math.round(mean * 100) / 100,
    count: n,
  };
}

async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 1000
): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error: ${err}`);
  }

  const result = await res.json();
  return result.choices?.[0]?.message?.content || "Unable to generate summary.";
}

/** Strip markdown code fences that OpenAI sometimes wraps around JSON */
function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
}

function buildResponsesText(responses: string[], max = 200): string {
  const sample = responses.slice(0, max);
  return sample.map((r, i) => `${i + 1}. ${r}`).join("\n");
}

async function analyzeGeneric(
  header: string,
  responses: string[]
): Promise<Record<string, unknown>> {
  const nonEmpty = responses.filter((r) => r !== "");
  if (nonEmpty.length === 0) {
    return { type: "generic", summary: "No responses in this time range." };
  }

  const summary = await callOpenAI(
    `You are an assistant that analyzes survey responses. Given a list of responses to a survey question, produce a concise bulleted summary using "-" bullets. Identify key themes and notable insights. Use numbers where relevant (e.g. "12/30 mentioned…"). Aim for 3-6 bullets.`,
    `Survey question/column: "${header}"\n\nTotal responses: ${nonEmpty.length}\n\nResponses:\n${buildResponsesText(nonEmpty)}\n\nProvide a concise bulleted summary of these responses.`
  );

  return { type: "generic", summary };
}

function analyzeRating(responses: string[]): Record<string, unknown> {
  const nums = responses
    .filter((r) => r !== "")
    .map((r) => parseFloat(r))
    .filter((n) => !isNaN(n) && n >= 1 && n <= 10);

  if (nums.length === 0) {
    return { type: "rating", stats: null, summary: "No valid ratings found." };
  }

  return { type: "rating", stats: fiveNumberSummary(nums) };
}

async function analyzeTestimonials(
  header: string,
  responses: string[]
): Promise<Record<string, unknown>> {
  const nonEmpty = responses.filter((r) => r !== "");
  if (nonEmpty.length === 0) {
    return { type: "testimonials", summary: "No responses in this time range.", testimonials: [] };
  }

  const raw = await callOpenAI(
    `You are an assistant that analyzes survey responses for a math educator named Dr. Raj Shah. You will produce JSON output only, no markdown.`,
    `Survey question: "${header}"\n\nTotal responses: ${nonEmpty.length}\n\nResponses:\n${buildResponsesText(nonEmpty)}\n\nAnalyze these responses and return a JSON object with exactly two keys:\n1. "summary": A single TEXT STRING (not an array) containing 3-6 bullet points, each on its own line starting with "- ". Use numbers where relevant (e.g. "18/30 mentioned…").\n2. "testimonials": An array of 3-5 of the best verbatim responses that could serve as testimonials for Dr. Shah's work. Pick responses that are specific, enthusiastic, and highlight impact.\n\nReturn ONLY valid JSON, no markdown fences.`,
    1200
  );

  try {
    const parsed = JSON.parse(stripMarkdownFences(raw));
    return { type: "testimonials", summary: parsed.summary || "", testimonials: parsed.testimonials || [] };
  } catch {
    return { type: "testimonials", summary: raw, testimonials: [] };
  }
}

async function analyzeImprovements(
  header: string,
  responses: string[]
): Promise<Record<string, unknown>> {
  const nonEmpty = responses.filter((r) => r !== "");
  if (nonEmpty.length === 0) {
    return { type: "improvements", summary: "No responses in this time range.", improvements: [] };
  }

  const raw = await callOpenAI(
    `You are an assistant that analyzes survey feedback for a math educator named Dr. Raj Shah. You will produce JSON output only, no markdown.`,
    `Survey question: "${header}"\n\nTotal responses: ${nonEmpty.length}\n\nResponses:\n${buildResponsesText(nonEmpty)}\n\nAnalyze these responses and return a JSON object with exactly two keys:\n1. "summary": A single TEXT STRING (not an array) containing 3-6 bullet points, each on its own line starting with "- ". Use numbers where relevant.\n2. "improvements": An array of 3-5 verbatim responses that most clearly highlight specific improvements or constructive suggestions Dr. Shah can act on.\n\nReturn ONLY valid JSON, no markdown fences.`,
    1200
  );

  try {
    const parsed = JSON.parse(stripMarkdownFences(raw));
    return { type: "improvements", summary: parsed.summary || "", improvements: parsed.improvements || [] };
  } catch {
    return { type: "improvements", summary: raw, improvements: [] };
  }
}

async function analyzeInvitations(
  header: string,
  responses: string[],
  contacts: RowContact[]
): Promise<Record<string, unknown>> {
  // Pair each response with its contact BEFORE filtering empties, so that
  // the index the AI sees always maps to the correct person.
  const pairs = responses
    .map((r, i) => ({ response: r, contact: contacts[i] }))
    .filter((p) => p.response !== "");

  if (pairs.length === 0) {
    return { type: "invitations", summary: "No responses in this time range.", invitations: [] };
  }

  const responsesText = pairs
    .map((p, i) => `${i + 1}. ${p.response}`)
    .join("\n");

  const raw = await callOpenAI(
    `You are an assistant that analyzes survey feedback for a math educator named Dr. Raj Shah. You will produce JSON output only, no markdown.`,
    `Survey question: "${header}"\n\nTotal responses: ${pairs.length}\n\nResponses:\n${responsesText}\n\nAnalyze these responses and return a JSON object with exactly two keys:\n1. "summary": A single TEXT STRING (not an array) containing 3-6 bullet points, each on its own line starting with "- ". Use numbers where relevant.\n2. "invitation_indices": An array of the 1-based response numbers (integers) where the respondent mentions wanting Dr. Shah to come to their school, district, or organization, or expresses interest in further collaboration or booking. Include ALL such responses. If none exist, return an empty array.\n\nReturn ONLY valid JSON, no markdown fences.`,
    1200
  );

  try {
    const parsed = JSON.parse(stripMarkdownFences(raw));
    const indices: number[] = parsed.invitation_indices || [];

    // Map 1-based AI indices back to the correctly paired contact info
    const invitations = indices
      .filter((i: number) => i >= 1 && i <= pairs.length)
      .map((i: number) => {
        const pair = pairs[i - 1];
        return {
          response: pair.response,
          name: pair.contact?.name || "Unknown",
          email: pair.contact?.email || "",
        };
      });

    return { type: "invitations", summary: parsed.summary || "", invitations };
  } catch {
    return { type: "invitations", summary: raw, invitations: [] };
  }
}

async function analyzeColumn(
  colIndex: number,
  header: string,
  responses: string[],
  contacts: RowContact[]
): Promise<Record<string, unknown>> {
  switch (colIndex) {
    case COL_G_INDEX:
      return analyzeRating(responses);
    case COL_H_INDEX:
      return analyzeTestimonials(header, responses);
    case COL_I_INDEX:
      return analyzeImprovements(header, responses);
    case COL_J_INDEX:
      return analyzeInvitations(header, responses, contacts);
    default:
      return analyzeGeneric(header, responses);
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

    const { startTime, endTime } = await req.json();

    if (!startTime || !endTime) {
      return jsonResponse(
        { error: "startTime and endTime are required" },
        400
      );
    }

    // Fetch survey data from Google Sheets
    const googleToken = await getGoogleAccessToken();
    const { columns, contacts } = await fetchSurveyColumns(
      googleToken,
      startTime,
      endTime
    );

    if (columns.length === 0) {
      return jsonResponse({ columns: [], message: "No data found." });
    }

    // Filter out column F (accountability partner) and analyze in parallel
    const analysisPromises = columns
      .map((col, idx) => ({ col, idx }))
      .filter(({ idx }) => idx !== COL_F_INDEX)
      .map(async ({ col, idx }) => {
        const analysis = await analyzeColumn(
          idx,
          col.header,
          col.responses,
          contacts
        );
        return {
          header: col.header,
          responseCount: col.responses.length,
          responses: col.responses,
          ...analysis,
        };
      });

    const summarized = await Promise.all(analysisPromises);

    return jsonResponse({ columns: summarized });
  } catch (err) {
    console.error("survey-analysis error:", err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
