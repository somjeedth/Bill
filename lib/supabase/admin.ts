import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client ด้วย service_role — ข้าม RLS ได้
 * ใช้เฉพาะฝั่ง server (เช่น /api/mcp) และต้องกรอง user_id เองทุก query
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY ใน Environment Variables");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type AdminClient = ReturnType<typeof createAdminClient>;
