import type { DocumentRow } from "./types";

type Lite = Pick<
  DocumentRow,
  "id" | "doc_type" | "doc_no" | "issue_date" | "due_date" | "status" | "customer_name" | "net_total" | "reference_id" | "installment_no" | "installment_count"
>;

/**
 * ใบวางบิลที่ถูกแบ่งจ่ายแล้ว (มีใบแบ่งจ่ายที่ไม่ยกเลิกอ้างอิงอยู่) จะไม่นับซ้ำ —
 * นับยอดจากใบแบ่งจ่ายแต่ละงวดแทน
 */
export function billableDocs(docs: Lite[]) {
  const splitParents = new Set(
    docs
      .filter((d) => d.doc_type === "installment" && d.status !== "cancelled" && d.reference_id)
      .map((d) => d.reference_id as string)
  );
  return docs.filter(
    (d) =>
      (d.doc_type === "invoice" && !splitParents.has(d.id)) || d.doc_type === "installment"
  );
}

export function summarize(docs: Lite[], year: number, month: number, today: string) {
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  const bills = billableDocs(docs).filter((d) => d.status !== "cancelled" && d.status !== "draft");
  const receipts = docs.filter((d) => d.doc_type === "receipt" && d.status !== "cancelled");
  const quotes = docs.filter((d) => d.doc_type === "quotation" && d.status !== "cancelled");

  const sum = (a: Lite[]) => a.reduce((s, d) => s + Number(d.net_total || 0), 0);

  const outstanding = bills
    .filter((d) => d.status === "pending" || d.status === "approved")
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  const overdue = outstanding.filter((d) => d.due_date && d.due_date < today);
  const dueThisMonth = outstanding.filter((d) => (d.due_date ?? d.issue_date).startsWith(ym));

  const monthly = Array.from({ length: 12 }, (_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, "0")}`;
    return {
      month: i + 1,
      billed: sum(bills.filter((d) => d.issue_date.startsWith(key))),
      received: sum(receipts.filter((d) => d.issue_date.startsWith(key))),
      quoted: sum(quotes.filter((d) => d.issue_date.startsWith(key))),
    };
  });

  return {
    month: monthly[month - 1],
    monthly,
    outstanding,
    outstandingTotal: sum(outstanding),
    overdue,
    overdueTotal: sum(overdue),
    dueThisMonth,
    dueThisMonthTotal: sum(dueThisMonth),
    yearBilled: monthly.reduce((s, m) => s + m.billed, 0),
    yearReceived: monthly.reduce((s, m) => s + m.received, 0),
    quotePending: quotes.filter((d) => d.status === "pending"),
  };
}
