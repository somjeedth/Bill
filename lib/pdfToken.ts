import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * ลิงก์ PDF แบบมีลายเซ็น (HMAC) และวันหมดอายุ — ใช้แชร์ให้ลูกค้า/AI bot โหลด PDF ได้โดยไม่ต้องล็อกอิน
 * secret: PDF_LINK_SECRET (ถ้าไม่ตั้ง จะใช้ SUPABASE_SERVICE_ROLE_KEY)
 */
function secret() {
  return process.env.PDF_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

const b64url = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function mac(docId: string, exp: number) {
  return b64url(createHmac("sha256", secret()).update(`pdf:${docId}:${exp}`).digest());
}

/** คืน token หรือ null ถ้ายังไม่ได้ตั้ง secret */
export function signPdfToken(docId: string, ttlSeconds = 7 * 24 * 3600): { token: string; expiresAt: Date } | null {
  if (!secret()) return null;
  const exp = Math.floor(Date.now() / 1000) + Math.max(60, Math.floor(ttlSeconds));
  return { token: `${exp}.${mac(docId, exp)}`, expiresAt: new Date(exp * 1000) };
}

export function verifyPdfToken(docId: string, token: string | null | undefined): boolean {
  if (!token || !secret()) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!Number.isInteger(exp) || !sig || exp < Date.now() / 1000) return false;
  const expected = Buffer.from(mac(docId, exp));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function pdfUrls(baseUrl: string, docId: string, token: string, copy = false) {
  const q = `t=${encodeURIComponent(token)}${copy ? "&copy=1" : ""}`;
  return {
    view: `${baseUrl}/api/pdf/${docId}?${q}`,
    download: `${baseUrl}/api/pdf/${docId}?${q}&download=1`,
    print_page: `${baseUrl}/print/${docId}?${q}`,
  };
}
