import type { DocDraft, InstallmentContext } from "@/components/DocumentForm";
import { round2 } from "./calc";
import { addDaysISO } from "./format";
import type { CompanySettings, DocItem, DocType, DocumentRow } from "./types";

export function bangkokToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

export function toDraft(r: DocumentRow): DocDraft {
  return {
    id: r.id,
    doc_type: r.doc_type,
    doc_no: r.doc_no,
    issue_date: r.issue_date,
    due_date: r.due_date,
    status: r.status,
    paid_date: r.paid_date,
    customer_id: r.customer_id,
    customer_name: r.customer_name,
    customer_address: r.customer_address,
    customer_tax_id: r.customer_tax_id,
    customer_branch: r.customer_branch,
    customer_contact: r.customer_contact,
    reference_id: r.reference_id,
    installment_no: r.installment_no,
    installment_count: r.installment_count,
    discount_type: r.discount_type,
    discount_value: Number(r.discount_value),
    vat_enabled: r.vat_enabled,
    vat_rate: Number(r.vat_rate),
    wht_rate: Number(r.wht_rate),
    notes: r.notes,
    payment_method: r.payment_method,
  };
}

export function blankDraft(type: DocType, company: Partial<CompanySettings> | null): DocDraft {
  const today = bangkokToday();
  return {
    doc_type: type,
    doc_no: "",
    issue_date: today,
    due_date: type === "receipt" ? null : addDaysISO(today, 30),
    status: type === "receipt" ? "paid" : "pending",
    paid_date: null,
    customer_id: null,
    customer_name: "",
    customer_address: "",
    customer_tax_id: "",
    customer_branch: "",
    customer_contact: "",
    reference_id: null,
    installment_no: null,
    installment_count: null,
    discount_type: "amount",
    discount_value: 0,
    vat_enabled: true,
    vat_rate: Number(company?.default_vat_rate ?? 7),
    wht_rate: 0,
    notes: company?.default_notes ?? "",
    payment_method: type === "receipt" ? "โอนเงิน" : "",
  };
}

export function itemsFromRows(rows: (DocItem & { sort_order?: number })[]): DocItem[] {
  return [...rows]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((r) => ({
      description: r.description,
      quantity: Number(r.quantity),
      unit: r.unit,
      unit_price: Number(r.unit_price),
    }));
}

/** สร้างเอกสารใหม่จากเอกสารต้นทาง (แปลง ใบเสนอราคา → ใบวางบิล → ใบแบ่งจ่าย → ใบเสร็จ) */
export function draftFromSource(
  target: DocType,
  src: DocumentRow,
  srcItems: DocItem[],
  company: Partial<CompanySettings> | null,
  prevInstallments: DocumentRow[]
): { draft: DocDraft; items: DocItem[]; installment: InstallmentContext | null } {
  const base = blankDraft(target, company);
  const draft: DocDraft = {
    ...base,
    customer_id: src.customer_id,
    customer_name: src.customer_name,
    customer_address: src.customer_address,
    customer_tax_id: src.customer_tax_id,
    customer_branch: src.customer_branch,
    customer_contact: src.customer_contact,
    reference_id: src.id,
    discount_type: src.discount_type,
    discount_value: Number(src.discount_value),
    vat_enabled: src.vat_enabled,
    vat_rate: Number(src.vat_rate),
    wht_rate: Number(src.wht_rate),
    notes: src.notes,
    installment_no: target === "receipt" ? src.installment_no : null,
    installment_count: target === "receipt" ? src.installment_count : null,
  };
  let items = srcItems;
  let installment: InstallmentContext | null = null;

  if (target === "installment") {
    const afterDiscount = round2(Number(src.subtotal) - Number(src.discount_amount));
    const billedBefore = round2(
      prevInstallments.reduce((s, d) => s + (Number(d.subtotal) - Number(d.discount_amount)), 0)
    );
    const prevCount = prevInstallments.length;
    const existingCount = Math.max(0, ...prevInstallments.map((d) => d.installment_count ?? 0));
    draft.installment_no = prevCount + 1;
    draft.installment_count = Math.max(existingCount, prevCount + 1, 2);
    draft.discount_type = "amount";
    draft.discount_value = 0;
    installment = {
      sourceNo: src.doc_no,
      sourceType: src.doc_type,
      base: afterDiscount,
      sourceNet: Number(src.net_total),
      billedBefore,
      prevCount,
    };
    const remainingPctDefault = round2(100 / draft.installment_count);
    items = [
      {
        description: `ค่างวดที่ ${draft.installment_no}/${draft.installment_count} (${remainingPctDefault}%) ตามเอกสารเลขที่ ${src.doc_no}`,
        quantity: 1,
        unit: "งวด",
        unit_price: round2((afterDiscount * remainingPctDefault) / 100),
      },
    ];
  }

  if (target === "receipt") {
    draft.notes = `อ้างอิง ${src.doc_no}${src.notes ? "\n" + src.notes : ""}`;
  }
  return { draft, items, installment };
}
