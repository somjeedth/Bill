// MCP endpoint (Streamable HTTP, stateless) — https://<your-app>/api/mcp
// ยืนยันตัวตนด้วย header:  Authorization: Bearer <token จากหน้า "ข้อมูลบริษัท">
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { userFromToken } from "@/lib/mcp/auth";
import { handleRpc, SERVER_INFO, type JsonRpcRequest } from "@/lib/mcp/protocol";
import { TOOLS } from "@/lib/mcp/tools";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version",
};

const rpcError = (status: number, code: number, message: string) =>
  NextResponse.json({ jsonrpc: "2.0", id: null, error: { code, message } }, { status, headers: CORS });

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** เปิดในเบราว์เซอร์เพื่อเช็กว่า endpoint ทำงาน (ไม่ใช้ SSE) */
export async function GET(req: NextRequest) {
  if ((req.headers.get("accept") ?? "").includes("text/event-stream")) {
    return new NextResponse("SSE stream not supported; use POST", { status: 405, headers: { ...CORS, Allow: "POST" } });
  }
  return NextResponse.json(
    { ok: true, server: SERVER_INFO, transport: "streamable-http", auth: "Authorization: Bearer <token>", tools: TOOLS.map((t) => t.name) },
    { headers: CORS }
  );
}

export async function POST(req: NextRequest) {
  let db;
  try {
    db = createAdminClient();
  } catch (e) {
    return rpcError(500, -32603, (e as Error).message);
  }

  const userId = await userFromToken(db, req.headers.get("authorization"));
  if (!userId) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized: token ไม่ถูกต้องหรือถูกยกเลิกแล้ว" } },
      { status: 401, headers: { ...CORS, "WWW-Authenticate": 'Bearer realm="mcp"' } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return rpcError(400, -32700, "Parse error");
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || req.nextUrl.origin;
  const ctx = { db, userId, baseUrl };

  const batch = Array.isArray(body);
  const msgs = (batch ? body : [body]) as JsonRpcRequest[];
  const results = (await Promise.all(msgs.map((m) => handleRpc(m, TOOLS, ctx)))).filter(Boolean);

  // มีแต่ notification/response → 202 ไม่มี body
  if (results.length === 0) return new NextResponse(null, { status: 202, headers: CORS });
  return NextResponse.json(batch ? results : results[0], { headers: CORS });
}
