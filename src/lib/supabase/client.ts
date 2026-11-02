"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types";
import { supabaseEnv } from "./env";

let browserClient: SupabaseClient<Database> | null = null;

/** 브라우저용 Supabase 클라이언트 (싱글턴). 세션은 쿠키로 유지되어 서버 컴포넌트와 공유됩니다. */
export function createClient(): SupabaseClient<Database> {
  if (browserClient) return browserClient;
  const { url, key } = supabaseEnv();
  browserClient = createBrowserClient<Database>(url, key);
  return browserClient;
}
