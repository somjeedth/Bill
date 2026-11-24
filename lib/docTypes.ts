import type { DocStatus, DocType } from "./types";

export const DOC_TYPES: Record<
  DocType,
  { th: string; en: string; short: string; color: string }
> = {
  quotation: { th: "ใบเสนอราคา", en: "Quotation", short: "เสนอราคา", color: "bg-sky-100 text-sky-800" },
  invoice: { th: "ใบวางบิล / ใบแจ้งหนี้", en: "Invoice", short: "วางบิล", color: "bg-amber-100 text-amber-800" },
  installment: { th: "ใบแจ้งหนี้แบ่งชำระ", en: "Installment Invoice", short: "แบ่งจ่าย", color: "bg-violet-100 text-violet-800" },
  receipt: { th: "ใบเสร็จรับเงิน", en: "Receipt", short: "ใบเสร็จ", color: "bg-emerald-100 text-emerald-800" },
};

export const DOC_TYPE_LIST: DocType[] = ["quotation", "invoice", "installment", "receipt"];

export function statusLabel(type: DocType, s: DocStatus): string {
  if (s === "draft") return "ร่าง";
  if (s === "cancelled") return "ยกเลิก";
  if (type === "quotation") {
    if (s === "pending") return "รออนุมัติ";
    if (s === "approved" || s === "paid") return "อนุมัติแล้ว";
  }
  if (type === "receipt") return "รับเงินแล้ว";
  if (s === "pending" || s === "approved") return "รอชำระ";
  if (s === "paid") return "ชำระแล้ว";
  return s;
}

export function statusOptions(type: DocType): DocStatus[] {
  if (type === "quotation") return ["draft", "pending", "approved", "cancelled"];
  if (type === "receipt") return ["paid", "cancelled"];
  return ["draft", "pending", "paid", "cancelled"];
}

export const STATUS_COLOR: Record<DocStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-sky-100 text-sky-800",
  paid: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-rose-100 text-rose-700 line-through",
};

/** เอกสารที่แปลงต่อได้จากเอกสารต้นทาง */
export const CONVERT_TO: Record<DocType, DocType[]> = {
  quotation: ["invoice", "installment"],
  invoice: ["installment", "receipt"],
  installment: ["receipt"],
  receipt: [],
};
