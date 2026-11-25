import type { AdminClient } from "@/lib/supabase/admin";
import { calcTotals, lineAmount, round2 } from "@/lib/calc";
import { summarize } from "@/lib/dashboard";
import { DOC_TYPES, DOC_TYPE_LIST, CONVERT_TO, statusLabel } from "@/lib/docTypes";
import { bangkokToday, blankDraft, draftFromSource, itemsFromRows } from "@/lib/draft";
import { addDaysISO, bahtText } from "@/lib/format";
import type { CompanySettings, DocItem, DocStatus, DocType, DocumentRow } from "@/lib/types";
import type { DocDraft } from "@/components/DocumentForm";
import { ToolError, type ToolDef } from "./protocol";
import { pdfUrls, signPdfToken } from "@/lib/pdfToken";

export interface McpCtx {
  db: AdminClient;
  userId: string;
  baseUrl: string;
}

type Args = Record<string, unknown>;

/* ---------------- helpers ---------------- */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: DocStatus[] = ["draft", "pending", "approved", "paid", "cancelled"];

const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
const optNum = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : Number(v));

function asType(v: unknown): DocType {
  const t = str(v) as DocType;
  if (!DOC_TYPE_LIST.includes(t)) throw new ToolError(`type ต้องเป็นหนึ่งใน ${DOC_TYPE_LIST.join(", ")}`);
  return t;
}
function asDate(v: unknown, field: string): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  if (!DATE_RE.test(s)) throw new ToolError(`${field} ต้องอยู่ในรูปแบบ YYYY-MM-DD`);
  return s;
}
function asItems(v: unknown): DocItem[] {
  if (!Array.isArray(v) || v.length === 0) throw new ToolError("items ต้องมีอย่างน้อย 1 รายการ");
  return v.map((raw, i) => {
    const it = (raw ?? {}) as Args;
    const description = str(it.description);
    const quantity = Number(it.quantity ?? 1);
    const unit_price = Number(it.unit_price);
    if (!description) throw new ToolError(`items[${i}].description ว่าง`);
    if (!Number.isFinite(quantity) || !Number.isFinite(unit_price))
      throw new ToolError(`items[${i}] quantity/unit_price ต้องเป็นตัวเลข`);
    return { description, quantity, unit: str(it.unit), unit_price };
  });
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

async function findDoc(ctx: McpCtx, ref: unknown) {
  const r = str(ref);
  if (!r) throw new ToolError("ต้องระบุ document (เลขที่เอกสาร หรือ id)");
  const q = ctx.db.from("documents").select("*, document_items(*)").eq("user_id", ctx.userId);
  const { data, error } = await (UUID_RE.test(r) ? q.eq("id", r) : q.ilike("doc_no", r)).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ToolError(`ไม่พบเอกสาร ${r}`);
  const { document_items, ...doc } = data as DocumentRow & { document_items: (DocItem & { sort_order: number })[] };
  return { doc: doc as DocumentRow, items: itemsFromRows(document_items ?? []) };
}

function docSummary(d: DocumentRow, baseUrl: string) {
  return {
    id: d.id,
    doc_no: d.doc_no,
    type: d.doc_type,
    type_th: DOC_TYPES[d.doc_type].th,
    status: d.status,
    status_th: statusLabel(d.doc_type, d.status),
    issue_date: d.issue_date,
    due_date: d.due_date,
    customer_name: d.customer_name,
    installment: d.installment_no ? `${d.installment_no}/${d.installment_count ?? "?"}` : undefined,
    net_total: Number(d.net_total),
    url: `${baseUrl}/documents/${d.id}`,
  };
}

function docDetail(d: DocumentRow, items: DocItem[], baseUrl: string) {
  return {
    ...docSummary(d, baseUrl),
    customer: {
      id: d.customer_id,
      name: d.customer_name,
      address: d.customer_address,
      tax_id: d.customer_tax_id,
      branch: d.customer_branch,
      contact: d.customer_contact,
    },
    reference_id: d.reference_id,
    items: items.map((it, i) => ({ no: i + 1, ...it, amount: lineAmount(it) })),
    totals: {
      subtotal: Number(d.subtotal),
      discount: { type: d.discount_type, value: Number(d.discount_value), amount: Number(d.discount_amount) },
      vat: { enabled: d.vat_enabled, rate: Number(d.vat_rate), amount: Number(d.vat_amount) },
      grand_total: Number(d.grand_total),
      wht: { rate: Number(d.wht_rate), amount: Number(d.wht_amount) },
      net_total: Number(d.net_total),
      net_total_text: bahtText(Number(d.net_total)),
    },
    notes: d.notes,
    payment_method: d.payment_method || undefined,
    paid_date: d.paid_date,
  };
}

async function getCompany(ctx: McpCtx): Promise<Partial<CompanySettings> | null> {
  return check(
    await ctx.db.from("company_settings").select("*").eq("user_id", ctx.userId).maybeSingle()
  ) as Partial<CompanySettings> | null;
}

/** บันทึกเอกสารใหม่ (คำนวณยอด + ออกเลขที่) */
async function insertDocument(ctx: McpCtx, draft: DocDraft, items: DocItem[]) {
  const totals = calcTotals({ items, ...draft });
  const docNo =
    draft.doc_no ||
    (check(
      await ctx.db.rpc("next_doc_no_for", { p_user: ctx.userId, p_type: draft.doc_type, p_date: draft.issue_date })
    ) as string);

  const { id: _omit, ...rest } = draft;
  void _omit;
  const row = {
    ...rest,
    user_id: ctx.userId,
    doc_no: docNo,
    paid_date: draft.status === "paid" ? draft.paid_date || draft.issue_date : null,
    subtotal: totals.subtotal,
    discount_amount: totals.discount_amount,
    vat_amount: totals.vat_amount,
    grand_total: totals.grand_total,
    wht_amount: totals.wht_amount,
    net_total: totals.net_total,
  };
  const inserted = check(await ctx.db.from("documents").insert(row).select("*").single()) as DocumentRow;
  await replaceItems(ctx, inserted.id, items);
  return inserted;
}

async function replaceItems(ctx: McpCtx, docId: string, items: DocItem[]) {
  check(await ctx.db.from("document_items").delete().eq("document_id", docId).eq("user_id", ctx.userId));
  check(
    await ctx.db.from("document_items").insert(
      items.map((it, i) => ({
        document_id: docId,
        user_id: ctx.userId,
        sort_order: i,
        description: it.description,
        quantity: it.quantity,
        unit: it.unit,
        unit_price: it.unit_price,
        amount: lineAmount(it),
      }))
    )
  );
}

/** หลังแปลงเอกสาร: อัปเดตสถานะต้นทาง (เหมือนหน้าเว็บ) */
async function afterConvert(ctx: McpCtx, src: DocumentRow, newType: DocType, date: string) {
  const upd = (id: string, patch: Record<string, unknown>) =>
    ctx.db.from("documents").update(patch).eq("id", id).eq("user_id", ctx.userId);

  if (src.doc_type === "quotation" && newType !== "receipt") await upd(src.id, { status: "approved" });
  if (newType !== "receipt") return;

  await upd(src.id, { status: "paid", paid_date: date });
  if (src.doc_type === "installment" && src.reference_id) {
    const sibs = (check(
      await ctx.db
        .from("documents")
        .select("status, installment_count")
        .eq("user_id", ctx.userId)
        .eq("reference_id", src.reference_id)
        .eq("doc_type", "installment")
        .neq("status", "cancelled")
    ) ?? []) as { status: DocStatus; installment_count: number | null }[];
    const all = sibs;
    const expected = Math.max(all.length, ...all.map((s) => s.installment_count ?? 0));
    if (all.length >= expected && all.every((s) => s.status === "paid"))
      await upd(src.reference_id, { status: "paid", paid_date: date });
  }
}

async function resolveCustomer(ctx: McpCtx, a: Args) {
  const id = str(a.customer_id);
  if (id) {
    const c = check(
      await ctx.db.from("customers").select("*").eq("user_id", ctx.userId).eq("id", id).maybeSingle()
    ) as Record<string, string> | null;
    if (!c) throw new ToolError(`ไม่พบลูกค้า id ${id}`);
    return {
      customer_id: c.id,
      customer_name: c.name,
      customer_address: c.address,
      customer_tax_id: c.tax_id,
      customer_branch: c.branch,
      customer_contact: [c.contact, c.phone].filter(Boolean).join(" "),
    };
  }
  const name = str(a.customer_name);
  if (!name) throw new ToolError("ต้องระบุ customer_id หรือ customer_name");

  // ถ้ามีลูกค้าชื่อนี้อยู่แล้ว ใช้ข้อมูลเดิม (ค่าที่ส่งมาจะทับ)
  const existing = check(
    await ctx.db.from("customers").select("*").eq("user_id", ctx.userId).ilike("name", name).limit(1)
  ) as Record<string, string>[];
  const c = existing?.[0];
  let customer_id: string | null = c?.id ?? null;
  const snap = {
    customer_name: name,
    customer_address: str(a.customer_address) || c?.address || "",
    customer_tax_id: str(a.customer_tax_id) || c?.tax_id || "",
    customer_branch: str(a.customer_branch) || c?.branch || "",
    customer_contact: str(a.customer_contact) || (c ? [c.contact, c.phone].filter(Boolean).join(" ") : ""),
  };
  if (!c && a.save_customer !== false) {
    const created = check(
      await ctx.db
        .from("customers")
        .insert({
          user_id: ctx.userId,
          name,
          address: snap.customer_address,
          tax_id: snap.customer_tax_id,
          branch: snap.customer_branch,
          contact: snap.customer_contact,
        })
        .select("id")
        .single()
    ) as { id: string };
    customer_id = created.id;
  }
  return { customer_id, ...snap };
}

function applyMoneyArgs(d: DocDraft, a: Args) {
  if (a.discount_type !== undefined) {
    const t = str(a.discount_type);
    if (t !== "percent" && t !== "amount") throw new ToolError("discount_type ต้องเป็น percent หรือ amount");
    d.discount_type = t;
  }
  if (optNum(a.discount_value) !== undefined) d.discount_value = Math.max(0, optNum(a.discount_value)!);
  if (typeof a.vat_enabled === "boolean") d.vat_enabled = a.vat_enabled;
  if (optNum(a.vat_rate) !== undefined) d.vat_rate = optNum(a.vat_rate)!;
  if (optNum(a.wht_rate) !== undefined) d.wht_rate = optNum(a.wht_rate)!;
  if (a.notes !== undefined) d.notes = str(a.notes);
  if (a.payment_method !== undefined) d.payment_method = str(a.payment_method);
  const issue = asDate(a.issue_date, "issue_date");
  if (issue) d.issue_date = issue;
  if (a.due_date === null) d.due_date = null;
  else {
    const due = asDate(a.due_date, "due_date");
    if (due) d.due_date = due;
  }
  if (a.status !== undefined) {
    const s = str(a.status) as DocStatus;
    if (!STATUSES.includes(s)) throw new ToolError(`status ต้องเป็นหนึ่งใน ${STATUSES.join(", ")}`);
    d.status = s;
  }
}

/* ---------------- schemas ---------------- */

const ITEM_SCHEMA = {
  type: "object",
  properties: {
    description: { type: "string", description: "รายละเอียดสินค้า/บริการ" },
    quantity: { type: "number", description: "จำนวน (ค่าเริ่มต้น 1)" },
    unit: { type: "string", description: "หน่วย เช่น ชิ้น งาน เดือน ชั่วโมง" },
    unit_price: { type: "number", description: "ราคาต่อหน่วย (บาท, ก่อน VAT)" },
  },
  required: ["description", "unit_price"],
};

const MONEY_PROPS = {
  discount_type: { type: "string", enum: ["percent", "amount"], description: "ส่วนลดเป็น % หรือ จำนวนบาท" },
  discount_value: { type: "number", description: "ค่าส่วนลด" },
  vat_enabled: { type: "boolean", description: "คิด VAT หรือไม่ (ค่าเริ่มต้น true)" },
  vat_rate: { type: "number", description: "อัตรา VAT % (ค่าเริ่มต้นตามการตั้งค่าบริษัท ปกติ 7)" },
  wht_rate: { type: "number", description: "หักภาษี ณ ที่จ่าย % เช่น 1, 2, 3, 5 (0 = ไม่หัก)" },
  notes: { type: "string", description: "หมายเหตุ/เงื่อนไข" },
  issue_date: { type: "string", description: "วันที่เอกสาร YYYY-MM-DD (ค่าเริ่มต้นวันนี้)" },
  due_date: { type: ["string", "null"], description: "ครบกำหนด/ยืนราคาถึง YYYY-MM-DD" },
  status: { type: "string", enum: STATUSES },
  payment_method: { type: "string", description: "สำหรับใบเสร็จ เช่น เงินสด โอนเงิน เช็ค" },
};

const CUSTOMER_PROPS = {
  customer_id: { type: "string", description: "id ลูกค้าจาก list_customers (ถ้ามี)" },
  customer_name: { type: "string", description: "ชื่อลูกค้า (ใช้เมื่อไม่มี customer_id)" },
  customer_address: { type: "string" },
  customer_tax_id: { type: "string", description: "เลขประจำตัวผู้เสียภาษี 13 หลัก" },
  customer_branch: { type: "string", description: "เช่น สำนักงานใหญ่" },
  customer_contact: { type: "string", description: "ผู้ติดต่อ/เบอร์โทร" },
};

const DOC_REF = { type: "string", description: "เลขที่เอกสาร เช่น QT202611-001 หรือ id" };

/* ---------------- tools ---------------- */

export const TOOLS: ToolDef<McpCtx>[] = [
  {
    name: "get_company_profile",
    title: "ข้อมูลบริษัท",
    description: "ดูข้อมูลบริษัทผู้ออกเอกสาร (ชื่อ ที่อยู่ เลขผู้เสียภาษี บัญชีธนาคาร อัตรา VAT เริ่มต้น)",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    run: async (_a, ctx) => {
      const c = await getCompany(ctx);
      if (!c) return { configured: false, message: "ยังไม่ได้ตั้งค่าข้อมูลบริษัท", settings_url: `${ctx.baseUrl}/settings` };
      return {
        configured: true,
        company_name: c.company_name,
        address: c.address,
        tax_id: c.tax_id,
        branch: c.branch,
        phone: c.phone,
        email: c.email,
        signer: { name: c.signer_name, title: c.signer_title },
        bank: { bank_name: c.bank_name, branch: c.bank_branch, account_name: c.bank_account_name, account_no: c.bank_account_no },
        has_logo: !!c.logo_path,
        has_signature: !!c.signature_path,
        has_stamp: !!c.stamp_path,
        has_qr: !!c.qr_path,
        default_vat_rate: Number(c.default_vat_rate ?? 7),
      };
    },
  },
  {
    name: "get_dashboard",
    title: "สรุปรายเดือน / ยอดรอจ่าย",
    description:
      "สรุปยอดวางบิล รับชำระ ยอดรอจ่าย และเกินกำหนด ของเดือนที่ระบุ พร้อมรายการค้างชำระทั้งหมด (เรียงตามวันครบกำหนด)",
    inputSchema: {
      type: "object",
      properties: {
        year: { type: "integer", description: "ปี ค.ศ. เช่น 2026 (ค่าเริ่มต้นปีปัจจุบัน)" },
        month: { type: "integer", minimum: 1, maximum: 12, description: "เดือน 1-12 (ค่าเริ่มต้นเดือนปัจจุบัน)" },
      },
    },
    annotations: { readOnlyHint: true },
    run: async (a, ctx) => {
      const today = bangkokToday();
      const year = Number(a.year) || Number(today.slice(0, 4));
      const month = Math.min(12, Math.max(1, Number(a.month) || Number(today.slice(5, 7))));
      const docs = check(
        await ctx.db
          .from("documents")
          .select("id, doc_type, doc_no, issue_date, due_date, status, customer_name, net_total, reference_id, installment_no, installment_count")
          .eq("user_id", ctx.userId)
          .limit(5000)
      ) as DocumentRow[];
      const s = summarize(docs, year, month, today);
      return {
        period: `${year}-${String(month).padStart(2, "0")}`,
        today,
        this_month: { billed: round2(s.month.billed), received: round2(s.month.received), quoted: round2(s.month.quoted) },
        outstanding_total: round2(s.outstandingTotal),
        outstanding_count: s.outstanding.length,
        overdue_total: round2(s.overdueTotal),
        overdue_count: s.overdue.length,
        due_this_month_total: round2(s.dueThisMonthTotal),
        year_billed: round2(s.yearBilled),
        year_received: round2(s.yearReceived),
        quotations_waiting_approval: s.quotePending.map((d) => docSummary(d as DocumentRow, ctx.baseUrl)),
        outstanding: s.outstanding.map((d) => ({
          ...docSummary(d as DocumentRow, ctx.baseUrl),
          overdue: !!(d.due_date && d.due_date < today),
        })),
        dashboard_url: `${ctx.baseUrl}/?y=${year}&m=${month}`,
      };
    },
  },
  {
    name: "list_documents",
    title: "ค้นหาเอกสาร",
    description: "ค้นหา/แสดงรายการเอกสาร กรองตามประเภท สถานะ เดือน หรือคำค้น (เลขที่/ชื่อลูกค้า)",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: DOC_TYPE_LIST },
        status: { type: "string", enum: STATUSES },
        month: { type: "string", description: "YYYY-MM" },
        query: { type: "string", description: "ค้นจากเลขที่เอกสารหรือชื่อลูกค้า" },
        limit: { type: "integer", minimum: 1, maximum: 100, description: "ค่าเริ่มต้น 20" },
      },
    },
    annotations: { readOnlyHint: true },
    run: async (a, ctx) => {
      let q = ctx.db
        .from("documents")
        .select("id, doc_type, doc_no, issue_date, due_date, status, customer_name, net_total, installment_no, installment_count")
        .eq("user_id", ctx.userId)
        .order("issue_date", { ascending: false })
        .order("doc_no", { ascending: false })
        .limit(Math.min(100, Number(a.limit) || 20));
      if (a.type) q = q.eq("doc_type", asType(a.type));
      if (a.status) q = q.eq("status", str(a.status));
      const month = str(a.month);
      if (month) {
        if (!/^\d{4}-\d{2}$/.test(month)) throw new ToolError("month ต้องเป็น YYYY-MM");
        const [y, m] = month.split("-").map(Number);
        const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
        q = q.gte("issue_date", `${month}-01`).lt("issue_date", end);
      }
      const query = str(a.query).replace(/[%,()*]/g, " ").trim();
      if (query) q = q.or(`doc_no.ilike.%${query}%,customer_name.ilike.%${query}%`);
      const docs = check(await q) as DocumentRow[];
      return {
        count: docs.length,
        total_net: round2(docs.filter((d) => d.status !== "cancelled").reduce((s, d) => s + Number(d.net_total), 0)),
        documents: docs.map((d) => docSummary(d, ctx.baseUrl)),
      };
    },
  },
  {
    name: "get_document",
    title: "ดูรายละเอียดเอกสาร",
    description: "ดูรายละเอียดเอกสารเต็ม: ลูกค้า รายการย่อย ยอดรวม ส่วนลด VAT หัก ณ ที่จ่าย ลิงก์สำหรับพิมพ์ และเอกสารที่ออกต่อ",
    inputSchema: { type: "object", properties: { document: DOC_REF }, required: ["document"] },
    annotations: { readOnlyHint: true },
    run: async (a, ctx) => {
      const { doc, items } = await findDoc(ctx, a.document);
      const children = check(
        await ctx.db
          .from("documents")
          .select("id, doc_type, doc_no, issue_date, due_date, status, customer_name, net_total, installment_no, installment_count")
          .eq("user_id", ctx.userId)
          .eq("reference_id", doc.id)
          .order("issue_date")
      ) as DocumentRow[];
      let reference = null;
      if (doc.reference_id) {
        reference = check(
          await ctx.db.from("documents").select("id, doc_no, doc_type").eq("user_id", ctx.userId).eq("id", doc.reference_id).maybeSingle()
        );
      }
      return {
        ...docDetail(doc, items, ctx.baseUrl),
        reference,
        children: children.map((c) => docSummary(c, ctx.baseUrl)),
        can_convert_to: CONVERT_TO[doc.doc_type],
      };
    },
  },
  {
    name: "list_customers",
    title: "รายชื่อลูกค้า",
    description: "ค้นหารายชื่อลูกค้าที่บันทึกไว้",
    inputSchema: { type: "object", properties: { query: { type: "string" } } },
    annotations: { readOnlyHint: true },
    run: async (a, ctx) => {
      let q = ctx.db.from("customers").select("*").eq("user_id", ctx.userId).order("name").limit(100);
      const query = str(a.query).replace(/[%,()*]/g, " ").trim();
      if (query) q = q.or(`name.ilike.%${query}%,tax_id.ilike.%${query}%,contact.ilike.%${query}%`);
      const rows = check(await q) as Record<string, string>[];
      return {
        count: rows.length,
        customers: rows.map(({ id, name, address, tax_id, branch, contact, phone, email }) => ({
          id, name, address, tax_id, branch, contact, phone, email,
        })),
      };
    },
  },
  {
    name: "create_customer",
    title: "เพิ่มลูกค้า",
    description: "บันทึกลูกค้าใหม่",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        address: { type: "string" },
        tax_id: { type: "string" },
        branch: { type: "string" },
        contact: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
      },
      required: ["name"],
    },
    run: async (a, ctx) => {
      const name = str(a.name);
      if (!name) throw new ToolError("ต้องระบุ name");
      const row = check(
        await ctx.db
          .from("customers")
          .insert({
            user_id: ctx.userId,
            name,
            address: str(a.address),
            tax_id: str(a.tax_id),
            branch: str(a.branch) || "สำนักงานใหญ่",
            contact: str(a.contact),
            phone: str(a.phone),
            email: str(a.email),
          })
          .select("*")
          .single()
      );
      return { created: true, customer: row };
    },
  },
  {
    name: "create_document",
    title: "สร้างเอกสาร",
    description:
      "สร้างใบเสนอราคา ใบวางบิล ใบแบ่งจ่าย หรือใบเสร็จใหม่ ระบบออกเลขที่และคำนวณยอดให้ (ถ้าจะออกต่อจากเอกสารเดิม ให้ใช้ convert_document แทน)",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: DOC_TYPE_LIST, description: "quotation=ใบเสนอราคา invoice=ใบวางบิล installment=ใบแบ่งจ่าย receipt=ใบเสร็จ" },
        ...CUSTOMER_PROPS,
        save_customer: { type: "boolean", description: "บันทึกเป็นลูกค้าใหม่ถ้ายังไม่มี (ค่าเริ่มต้น true)" },
        items: { type: "array", items: ITEM_SCHEMA, minItems: 1 },
        ...MONEY_PROPS,
      },
      required: ["type", "items"],
    },
    run: async (a, ctx) => {
      const type = asType(a.type);
      const items = asItems(a.items);
      const company = await getCompany(ctx);
      const draft = blankDraft(type, company);
      Object.assign(draft, await resolveCustomer(ctx, a));
      applyMoneyArgs(draft, a);
      if (a.due_date === undefined && type !== "receipt") draft.due_date = addDaysISO(draft.issue_date, 30);
      const doc = await insertDocument(ctx, draft, items);
      return { created: true, ...docDetail(doc, items, ctx.baseUrl) };
    },
  },
  {
    name: "update_document",
    title: "แก้ไขเอกสาร",
    description:
      "แก้ไขเอกสารที่มีอยู่: เปลี่ยนรายการย่อยทั้งหมด (ส่ง items ใหม่ครบทุกรายการ), ส่วนลด, VAT, หัก ณ ที่จ่าย, หมายเหตุ, วันที่, ข้อมูลลูกค้า ระบบคำนวณยอดใหม่ให้",
    inputSchema: {
      type: "object",
      properties: {
        document: DOC_REF,
        items: { type: "array", items: ITEM_SCHEMA, description: "ถ้าส่งมา จะแทนที่รายการเดิมทั้งหมด" },
        ...CUSTOMER_PROPS,
        ...MONEY_PROPS,
      },
      required: ["document"],
    },
    run: async (a, ctx) => {
      const { doc, items: oldItems } = await findDoc(ctx, a.document);
      const items = a.items !== undefined ? asItems(a.items) : oldItems;
      const draft: DocDraft = { ...doc };
      if (a.customer_id || a.customer_name) Object.assign(draft, await resolveCustomer(ctx, { save_customer: false, ...a }));
      applyMoneyArgs(draft, a);
      const t = calcTotals({ items, ...draft });
      const patch = {
        customer_id: draft.customer_id,
        customer_name: draft.customer_name,
        customer_address: draft.customer_address,
        customer_tax_id: draft.customer_tax_id,
        customer_branch: draft.customer_branch,
        customer_contact: draft.customer_contact,
        issue_date: draft.issue_date,
        due_date: draft.due_date,
        status: draft.status,
        paid_date: draft.status === "paid" ? draft.paid_date || draft.issue_date : null,
        discount_type: draft.discount_type,
        discount_value: draft.discount_value,
        vat_enabled: draft.vat_enabled,
        vat_rate: draft.vat_rate,
        wht_rate: draft.wht_rate,
        notes: draft.notes,
        payment_method: draft.payment_method,
        subtotal: t.subtotal,
        discount_amount: t.discount_amount,
        vat_amount: t.vat_amount,
        grand_total: t.grand_total,
        wht_amount: t.wht_amount,
        net_total: t.net_total,
      };
      const updated = check(
        await ctx.db.from("documents").update(patch).eq("id", doc.id).eq("user_id", ctx.userId).select("*").single()
      ) as DocumentRow;
      if (a.items !== undefined) await replaceItems(ctx, doc.id, items);
      return { updated: true, ...docDetail(updated, items, ctx.baseUrl) };
    },
  },
  {
    name: "convert_document",
    title: "ออกเอกสารต่อ",
    description:
      "ออกเอกสารต่อจากเอกสารเดิม: ใบเสนอราคา→invoice/installment, ใบวางบิล→installment/receipt, ใบแบ่งจ่าย→receipt คัดลอกลูกค้าและรายการให้อัตโนมัติ ออกใบเสร็จแล้วเอกสารต้นทางจะเป็น 'ชำระแล้ว'",
    inputSchema: {
      type: "object",
      properties: {
        document: DOC_REF,
        to_type: { type: "string", enum: ["invoice", "installment", "receipt"] },
        installment_percent: { type: "number", description: "สำหรับ installment: % ของยอด (ก่อน VAT) งวดนี้ เช่น 50" },
        installment_amount: { type: "number", description: "สำหรับ installment: จำนวนบาท (ก่อน VAT) งวดนี้ แทน percent" },
        installment_count: { type: "integer", description: "สำหรับ installment: จำนวนงวดทั้งหมด" },
        issue_date: { type: "string", description: "YYYY-MM-DD (ค่าเริ่มต้นวันนี้)" },
        due_date: { type: "string", description: "YYYY-MM-DD" },
        payment_method: { type: "string", description: "สำหรับ receipt เช่น โอนเงิน เงินสด" },
        notes: { type: "string" },
      },
      required: ["document", "to_type"],
    },
    run: async (a, ctx) => {
      const { doc: src, items: srcItems } = await findDoc(ctx, a.document);
      const to = asType(a.to_type);
      if (!CONVERT_TO[src.doc_type].includes(to))
        throw new ToolError(`${DOC_TYPES[src.doc_type].th} แปลงเป็น ${DOC_TYPES[to].th} ไม่ได้ (ได้: ${CONVERT_TO[src.doc_type].join(", ") || "-"})`);

      let prev: DocumentRow[] = [];
      if (to === "installment") {
        prev = (check(
          await ctx.db
            .from("documents")
            .select("*")
            .eq("user_id", ctx.userId)
            .eq("reference_id", src.id)
            .eq("doc_type", "installment")
            .neq("status", "cancelled")
        ) ?? []) as DocumentRow[];
      }
      const company = await getCompany(ctx);
      const { draft, items: draftItems, installment } = draftFromSource(to, src, srcItems, company, prev);
      let items = draftItems;

      if (to === "installment" && installment) {
        const count = Number(a.installment_count) || draft.installment_count || 2;
        draft.installment_count = Math.max(count, draft.installment_no ?? 1);
        const pct = optNum(a.installment_percent);
        const amt = optNum(a.installment_amount);
        const amount =
          amt !== undefined ? round2(amt) : round2((installment.base * (pct ?? round2(100 / draft.installment_count))) / 100);
        const remaining = round2(installment.base - installment.billedBefore);
        if (amount <= 0) throw new ToolError("ยอดงวดต้องมากกว่า 0");
        if (amount > remaining + 0.01)
          throw new ToolError(`ยอดงวดนี้ ${amount} เกินยอดคงเหลือ ${remaining} (ก่อน VAT)`);
        const shownPct = round2((amount / (installment.base || 1)) * 100);
        items = [
          {
            description: `ค่างวดที่ ${draft.installment_no}/${draft.installment_count} (${shownPct}%) ตามเอกสารเลขที่ ${src.doc_no}`,
            quantity: 1,
            unit: "งวด",
            unit_price: amount,
          },
        ];
      }

      const issue = asDate(a.issue_date, "issue_date");
      if (issue) {
        draft.issue_date = issue;
        if (to !== "receipt") draft.due_date = addDaysISO(issue, 30);
      }
      const due = asDate(a.due_date, "due_date");
      if (due) draft.due_date = due;
      if (a.payment_method !== undefined) draft.payment_method = str(a.payment_method);
      if (a.notes !== undefined) draft.notes = str(a.notes);

      const doc = await insertDocument(ctx, draft, items);
      await afterConvert(ctx, src, to, draft.issue_date);
      return { created: true, from: src.doc_no, ...docDetail(doc, items, ctx.baseUrl) };
    },
  },
  {
    name: "set_document_status",
    title: "เปลี่ยนสถานะเอกสาร",
    description:
      "เปลี่ยนสถานะ: draft=ร่าง, pending=รอดำเนินการ/รอชำระ, approved=อนุมัติ (ใบเสนอราคา), paid=ชำระแล้ว, cancelled=ยกเลิก",
    inputSchema: {
      type: "object",
      properties: {
        document: DOC_REF,
        status: { type: "string", enum: STATUSES },
        paid_date: { type: "string", description: "YYYY-MM-DD เมื่อ status=paid (ค่าเริ่มต้นวันนี้)" },
      },
      required: ["document", "status"],
    },
    annotations: { idempotentHint: true },
    run: async (a, ctx) => {
      const { doc } = await findDoc(ctx, a.document);
      const status = str(a.status) as DocStatus;
      if (!STATUSES.includes(status)) throw new ToolError(`status ต้องเป็นหนึ่งใน ${STATUSES.join(", ")}`);
      const paid_date = status === "paid" ? asDate(a.paid_date, "paid_date") ?? bangkokToday() : null;
      const updated = check(
        await ctx.db
          .from("documents")
          .update({ status, paid_date })
          .eq("id", doc.id)
          .eq("user_id", ctx.userId)
          .select("*")
          .single()
      ) as DocumentRow;
      return { updated: true, ...docSummary(updated, ctx.baseUrl) };
    },
  },
  {
    name: "get_document_pdf",
    title: "ดาวน์โหลด PDF เอกสาร",
    description:
      "สร้างลิงก์ดาวน์โหลดไฟล์ PDF ของเอกสาร (หน้าตาเดียวกับที่พิมพ์จากเว็บ มีโลโก้ ลายเซ็น ตราประทับ QR) ลิงก์เปิดได้โดยไม่ต้องล็อกอิน ส่งต่อให้ลูกค้าได้ และหมดอายุตามที่กำหนด",
    inputSchema: {
      type: "object",
      properties: {
        document: DOC_REF,
        with_copy: { type: "boolean", description: "พิมพ์ต้นฉบับ + สำเนา (2 หน้า) ค่าเริ่มต้น false" },
        expires_in_days: { type: "number", minimum: 1, maximum: 90, description: "อายุลิงก์ (วัน) ค่าเริ่มต้น 7" },
      },
      required: ["document"],
    },
    annotations: { readOnlyHint: true },
    run: async (a, ctx) => {
      const { doc } = await findDoc(ctx, a.document);
      const days = Math.min(90, Math.max(1, Number(a.expires_in_days) || 7));
      const signed = signPdfToken(doc.id, days * 86400);
      if (!signed) throw new ToolError("ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY หรือ PDF_LINK_SECRET บนเซิร์ฟเวอร์");
      const urls = pdfUrls(ctx.baseUrl, doc.id, signed.token, a.with_copy === true);
      const filename = `${doc.doc_no}.pdf`;
      return {
        doc_no: doc.doc_no,
        type_th: DOC_TYPES[doc.doc_type].th,
        customer_name: doc.customer_name,
        net_total: Number(doc.net_total),
        filename,
        pdf_download_url: urls.download,
        pdf_view_url: urls.view,
        expires_at: signed.expiresAt.toISOString(),
        note: "ส่งลิงก์ pdf_download_url ให้ผู้ใช้กดดาวน์โหลด (ครั้งแรกอาจใช้เวลา 5-10 วินาทีในการสร้างไฟล์)",
        _resource_links: [
          { uri: urls.download, name: filename, title: `${DOC_TYPES[doc.doc_type].th} ${doc.doc_no}`, mimeType: "application/pdf" },
        ],
      };
    },
  },
];
