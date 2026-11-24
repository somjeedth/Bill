import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DOC_TYPES, DOC_TYPE_LIST, STATUS_COLOR, statusLabel } from "@/lib/docTypes";
import { money, thDate } from "@/lib/format";
import type { DocType, DocumentRow } from "@/lib/types";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string; status?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const type = (DOC_TYPE_LIST as string[]).includes(sp.type ?? "") ? (sp.type as DocType) : undefined;

  const supabase = await createClient();
  let query = supabase
    .from("documents")
    .select("id, doc_type, doc_no, issue_date, due_date, status, customer_name, net_total, installment_no, installment_count")
    .order("issue_date", { ascending: false })
    .order("doc_no", { ascending: false })
    .limit(500);
  if (type) query = query.eq("doc_type", type);
  if (sp.status) query = query.eq("status", sp.status);
  if (sp.month && /^\d{4}-\d{2}$/.test(sp.month)) {
    const [y, m] = sp.month.split("-").map(Number);
    const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    query = query.gte("issue_date", `${sp.month}-01`).lt("issue_date", end);
  }
  if (sp.q) {
    const q = sp.q.replace(/[%,()]/g, " ").trim();
    if (q) query = query.or(`doc_no.ilike.%${q}%,customer_name.ilike.%${q}%`);
  }
  const { data } = await query;
  const docs = (data ?? []) as DocumentRow[];
  const total = docs.filter((d) => d.status !== "cancelled").reduce((s, d) => s + Number(d.net_total), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{type ? DOC_TYPES[type].th : "เอกสารทั้งหมด"}</h1>
        <Link href={`/documents/new?type=${type ?? "quotation"}`} className="btn-primary">
          + สร้าง{type ? DOC_TYPES[type].short : "เอกสาร"}
        </Link>
      </div>

      <form className="card flex flex-wrap items-end gap-3 p-4">
        {type && <input type="hidden" name="type" value={type} />}
        <div className="min-w-56 flex-1">
          <label className="label">ค้นหาเลขที่ / ลูกค้า</label>
          <input name="q" defaultValue={sp.q} className="input" />
        </div>
        <div>
          <label className="label">เดือน</label>
          <input type="month" name="month" defaultValue={sp.month} className="input" />
        </div>
        <div>
          <label className="label">สถานะ</label>
          <select name="status" defaultValue={sp.status ?? ""} className="input">
            <option value="">ทั้งหมด</option>
            <option value="draft">ร่าง</option>
            <option value="pending">รอดำเนินการ / รอชำระ</option>
            <option value="approved">อนุมัติแล้ว</option>
            <option value="paid">ชำระแล้ว</option>
            <option value="cancelled">ยกเลิก</option>
          </select>
        </div>
        <button className="btn-ghost">กรอง</button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2">เลขที่</th>
              {!type && <th>ประเภท</th>}
              <th>วันที่</th>
              <th>ลูกค้า</th>
              <th>ครบกำหนด</th>
              <th>สถานะ</th>
              <th className="pr-4 text-right">ยอดสุทธิ</th>
            </tr>
          </thead>
          <tbody>
            {docs.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">ไม่พบเอกสาร</td></tr>
            )}
            {docs.map((d) => (
              <tr key={d.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2 font-medium">
                  <Link href={`/documents/${d.id}`} className="text-brand-700 hover:underline">{d.doc_no}</Link>
                  {d.installment_no && (
                    <span className="ml-1 text-xs text-slate-500">งวด {d.installment_no}/{d.installment_count ?? "?"}</span>
                  )}
                </td>
                {!type && (
                  <td><span className={`badge ${DOC_TYPES[d.doc_type].color}`}>{DOC_TYPES[d.doc_type].short}</span></td>
                )}
                <td>{thDate(d.issue_date)}</td>
                <td>{d.customer_name}</td>
                <td>{d.due_date ? thDate(d.due_date) : "-"}</td>
                <td><span className={`badge ${STATUS_COLOR[d.status]}`}>{statusLabel(d.doc_type, d.status)}</span></td>
                <td className="num pr-4 text-right">{money(d.net_total)}</td>
              </tr>
            ))}
          </tbody>
          {docs.length > 0 && (
            <tfoot>
              <tr className="border-t bg-slate-50 font-medium">
                <td className="px-4 py-2" colSpan={type ? 5 : 6}>รวม {docs.length} รายการ (ไม่รวมที่ยกเลิก)</td>
                <td className="num pr-4 text-right">{money(total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
