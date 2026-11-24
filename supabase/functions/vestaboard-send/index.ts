import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHandler } from "./handler.mjs";

serve(createHandler({ createClient, env: (name: string) => Deno.env.get(name) }));
