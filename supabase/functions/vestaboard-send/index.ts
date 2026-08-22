import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Vestaboard API ─────────────────────────────────────────────────────────

interface VestaboardItem {
  id: string;
  name: string;
  mode: "text" | "grid";
  text_content: string | null;
  grid_content: number[][] | null;
}

async function sendToVestaboard(item: VestaboardItem): Promise<void> {
  const apiKey = Deno.env.get("VESTABOARD_API_KEY")!;

  const body =
    item.mode === "grid"
      ? { characters: item.grid_content }
      : { text: item.text_content ?? "" };

  const res = await fetch("https://rw.vestaboard.com/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Vestaboard-Read-Write-Key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vestaboard API error (${res.status}): ${err}`);
  }
}

// ─── Timezone helpers ───────────────────────────────────────────────────────

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

interface ZonedNow {
  weekday: number; // 0=Sunday..6=Saturday
  hhmm: string; // "HH:MM"
  dateKey: string; // "YYYY-MM-DD" in the target timezone, used to dedupe sends
}

function getZonedNow(date: Date, timeZone: string): ZonedNow {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value])
  );

  // Some locales/environments render midnight as "24" with hour12: false.
  const hour = parts.hour === "24" ? "00" : parts.hour;

  return {
    weekday: WEEKDAY_INDEX[parts.weekday],
    hhmm: `${hour}:${parts.minute}`,
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

// ─── Main Handler ──────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { action, itemId } = await req.json();

    // ── ACTION: send-now (authenticated user, from the browser) ──────────
    if (action === "send-now") {
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

      if (!itemId) {
        return jsonResponse({ error: "itemId is required" }, 400);
      }

      const { data: item, error: itemError } = await supabase
        .from("vestaboard_items")
        .select("id, name, mode, text_content, grid_content")
        .eq("id", itemId)
        .eq("user_id", user.id)
        .single();

      if (itemError || !item) {
        return jsonResponse({ error: "Item not found" }, 404);
      }

      try {
        await sendToVestaboard(item as VestaboardItem);
      } catch (err) {
        return jsonResponse({ error: (err as Error).message }, 502);
      }

      return jsonResponse({ success: true });
    }

    // ── ACTION: run-schedule (cron-triggered, shared-secret authenticated) ─
    if (action === "run-schedule") {
      const cronSecret = req.headers.get("X-Cron-Secret");
      const expectedSecret = Deno.env.get("VESTABOARD_CRON_SECRET");

      if (!expectedSecret || cronSecret !== expectedSecret) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      // Uses the service role key to bypass RLS — there's no user
      // session in a cron-triggered request.
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { data: schedules, error: scheduleError } = await supabase
        .from("vestaboard_schedules")
        .select(
          "id, item_id, days_of_week, time_of_day, timezone, enabled, last_sent_at"
        )
        .eq("enabled", true);

      if (scheduleError) {
        return jsonResponse({ error: scheduleError.message }, 500);
      }

      const now = new Date();
      const results: Record<string, string> = {};

      for (const schedule of schedules || []) {
        const zoned = getZonedNow(now, schedule.timezone);
        const scheduledHHMM = (schedule.time_of_day as string).slice(0, 5); // "HH:MM:SS" -> "HH:MM"

        const dayMatches = (schedule.days_of_week as number[]).includes(
          zoned.weekday
        );
        const timeMatches = zoned.hhmm === scheduledHHMM;

        if (!dayMatches || !timeMatches) continue;

        // Avoid double-sending if this schedule already fired today
        // (e.g. cron overlap, or multiple invocations within the minute).
        if (schedule.last_sent_at) {
          const lastSentZoned = getZonedNow(
            new Date(schedule.last_sent_at),
            schedule.timezone
          );
          if (lastSentZoned.dateKey === zoned.dateKey) {
            continue;
          }
        }

        const { data: item, error: itemError } = await supabase
          .from("vestaboard_items")
          .select("id, name, mode, text_content, grid_content")
          .eq("id", schedule.item_id)
          .single();

        if (itemError || !item) {
          results[schedule.id] = `item not found: ${itemError?.message}`;
          continue;
        }

        try {
          await sendToVestaboard(item as VestaboardItem);
          await supabase
            .from("vestaboard_schedules")
            .update({ last_sent_at: now.toISOString() })
            .eq("id", schedule.id);
          results[schedule.id] = "sent";
        } catch (err) {
          results[schedule.id] = `error: ${(err as Error).message}`;
        }
      }

      return jsonResponse({ success: true, results });
    }

    return jsonResponse(
      { error: "Invalid action. Use 'send-now' or 'run-schedule'." },
      400
    );
  } catch (err) {
    console.error("vestaboard-send error:", err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
