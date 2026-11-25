import { createHash } from "node:crypto";
import type { AdminClient } from "@/lib/supabase/admin";

export const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");

/** ตรวจ Bearer token แล้วคืน user_id เจ้าของ token */
export async function userFromToken(db: AdminClient, authHeader: string | null): Promise<string | null> {
  const m = authHeader?.match(/^Bearer\s+(\S+)$/i);
  if (!m) return null;
  const hash = sha256Hex(m[1]);
  const { data } = await db.from("api_tokens").select("id, user_id").eq("token_hash", hash).maybeSingle();
  if (!data) return null;
  // บันทึกเวลาใช้งานล่าสุด (ไม่ต้องรอ)
  void db.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id).then(() => {});
  return data.user_id as string;
}
