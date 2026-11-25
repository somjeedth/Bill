/**
 * MCP (Model Context Protocol) แบบ stateless ผ่าน Streamable HTTP
 * รองรับ initialize, ping, tools/list, tools/call — ตอบกลับเป็น application/json
 */

export const SERVER_INFO = { name: "thai-billing", title: "ระบบบัญชี (ใบเสนอราคา/วางบิล/ใบเสร็จ)", version: "1.0.0" };
const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const LATEST = SUPPORTED_VERSIONS[0];

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface ToolDef<Ctx> {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean };
  run: (args: Record<string, unknown>, ctx: Ctx) => Promise<unknown>;
}

/** ข้อผิดพลาดที่ตั้งใจส่งกลับให้ AI อ่าน (เช่น ไม่พบเอกสาร) */
export class ToolError extends Error {}

export const INSTRUCTIONS = `ระบบบัญชีสำหรับออกเอกสารภาษาไทย: ใบเสนอราคา (quotation), ใบวางบิล (invoice), ใบแบ่งจ่าย (installment), ใบเสร็จรับเงิน (receipt)
- เงินทั้งหมดเป็นบาท ทศนิยม 2 ตำแหน่ง
- ยอดคำนวณ: subtotal → ส่วนลด (percent หรือ amount) → VAT คิดจากยอดหลังส่วนลด → หัก ณ ที่จ่าย (wht_rate) คิดจากยอดก่อน VAT → net_total คือยอดที่ลูกค้าต้องจ่าย
- อ้างถึงเอกสารด้วยเลขที่ (เช่น QT202611-001) หรือ id ก็ได้
- ลำดับงานปกติ: ใบเสนอราคา → convert_document เป็น invoice หรือ installment → convert_document เป็น receipt เมื่อได้รับเงิน
- ผู้ใช้ขอไฟล์ PDF/ส่งเอกสารให้ลูกค้า → get_document_pdf แล้วให้ลิงก์ดาวน์โหลด
- ก่อนสร้าง/แก้ไขเอกสาร ควรสรุปรายการและยอดให้ผู้ใช้ยืนยันก่อน`;

export async function handleRpc<Ctx>(
  msg: JsonRpcRequest,
  tools: ToolDef<Ctx>[],
  ctx: Ctx
): Promise<JsonRpcResponse | null> {
  if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    const badId = msg && typeof msg === "object" && "id" in msg ? (msg.id ?? null) : null;
    return { jsonrpc: "2.0", id: badId, error: { code: -32600, message: "Invalid Request" } };
  }
  const id = msg.id ?? null;
  const isNotification = msg.id === undefined;

  // notification (ไม่มี id) ไม่ต้องตอบ
  if (isNotification) return null;

  const ok = (result: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id, result });
  const fail = (code: number, message: string): JsonRpcResponse => ({ jsonrpc: "2.0", id, error: { code, message } });

  switch (msg.method) {
    case "initialize": {
      const requested = String(msg.params?.protocolVersion ?? "");
      return ok({
        protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : LATEST,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({
        tools: tools.map(({ name, title, description, inputSchema, annotations }) => ({
          name,
          title,
          description,
          inputSchema,
          annotations,
        })),
      });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const tool = tools.find((t) => t.name === name);
      if (!tool) return fail(-32602, `Unknown tool: ${name}`);
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        let data = await tool.run(args, ctx);
        // tool คืน _resource_links ได้ → แนบเป็น resource_link (เช่น ไฟล์ PDF)
        let links: Record<string, unknown>[] = [];
        if (data && typeof data === "object" && "_resource_links" in (data as object)) {
          const { _resource_links, ...rest } = data as { _resource_links: Record<string, unknown>[] };
          links = _resource_links ?? [];
          data = rest;
        }
        const structured = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : { result: data };
        return ok({
          content: [
            { type: "text", text: JSON.stringify(data, null, 2) },
            ...links.map((l) => ({ type: "resource_link", ...l })),
          ],
          structuredContent: structured,
          isError: false,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return ok({ content: [{ type: "text", text: `ผิดพลาด: ${message}` }], isError: true });
      }
    }
    default:
      return fail(-32601, `Method not found: ${msg.method}`);
  }
}
