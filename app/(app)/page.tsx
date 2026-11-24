import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { summarize } from "@/lib/dashboard";
import { money, thDate, thMonth, thMonthShort } from "@/lib/format";
import { DOC_TYPES } from "@/lib/docTypes";
import type { DocumentRow } from "@/lib/types";

function bangkokToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const sp = await searchParams;
  const today = bangkokToday();
  const year = Number(sp.y) || Number(today.slice(0, 4));
  const month = Math.min(12, Math.max(1, Number(sp.m) || Number(today.slice(5, 7))));

  const supabase = await createClient();
  const [{ data: docs }, { data: company }] = await Promise.all([
    supabase
      .from("documents")
      .select(
        "id, doc_type, doc_no, issue_date, due_date, status, customer_name, net_total, reference_id, installment_no, installment_count"
      )
      .order("issue_date", { ascending: false })
      .limit(5000),
    supabase.from("company_settings").select("company_name").maybeSingle(),
  ]);

  const s = summarize((docs ?? []) as DocumentRow[], year, month, today);
  const maxBar = Math.max(1, ...s.monthly.map((m) => Math.max(m.billed, m.received)));

  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };

  return (
    <div className="space-y-6">
      {!company?.company_name && (
        <div className="card flex items-center justify-between border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">ยังไม่ได้ตั้งค่าข้อมูลบริษัท (ชื่อ ที่อยู่ เลขผู้เสียภาษี โลโก้ ลายเซ็น บัญชีธนาคาร)</p>
          <Link href="/settings" className="btn-primary">ตั้งค่าเลย</Link>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">แดชบอร์ดรายเดือน</h1>
          <p className="text-sm text-slate-500">{company?.company_name || "—"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/?y=${prev.y}&m=${prev.m}`} className="btn-ghost px-3">‹</Link>
          <span className="min-w-36 text-center font-medium">{thMonth(year, month)}</span>
          <Link href={`/?y=${next.y}&m=${next.m}`} className="btn-ghost px-3">›</Link>
          <Link href="/documents/new?type=quotation" className="btn-primary ml-2">+ สร้างเอกสาร</Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="ยอดวางบิลเดือนนี้" value={s.month.billed} tone="text-slate-900" />
        <Stat label="รับชำระแล้วเดือนนี้" value={s.month.received} tone="text-emerald-600" />
        <Stat
          label="รอจ่ายทั้งหมด"
          value={s.outstandingTotal}
          tone="text-amber-600"
          sub={`${s.outstanding.length} รายการ · ครบกำหนดเดือนนี้ ${money(s.dueThisMonthTotal)}`}
        />
        <Stat
          label="เกินกำหนดชำระ"
          value={s.overdueTotal}
          tone="text-rose-600"
          sub={`${s.overdue.length} รายการ`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">ภาพรวมปี {year + 543}</h2>
            <div className="flex gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-brand-500" />วางบิล {money(s.yearBilled)}</span>
              <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />รับเงิน {money(s.yearReceived)}</span>
            </div>
          </div>
          <div className="flex h-56 items-end gap-2">
            {s.monthly.map((m) => (
              <Link
                key={m.month}
                href={`/?y=${year}&m=${m.month}`}
                className={`group flex h-full flex-1 flex-col justify-end rounded-md px-0.5 ${m.month === month ? "bg-slate-100" : "hover:bg-slate-50"}`}
                title={`วางบิล ${money(m.billed)} / รับเงิน ${money(m.received)}`}
              >
                <div className="flex flex-1 items-end justify-center gap-0.5">
                  <div className="w-1/2 max-w-4 rounded-t bg-brand-500" style={{ height: `${(m.billed / maxBar) * 100}%` }} />
                  <div className="w-1/2 max-w-4 rounded-t bg-emerald-500" style={{ height: `${(m.received / maxBar) * 100}%` }} />
                </div>
                <div className="mt-1 text-center text-[11px] text-slate-500">{thMonthShort(m.month)}</div>
              </Link>
            ))}
          </div>
        </section>

        <section className="card">
          <h2 className="mb-3 font-semibold">ใบเสนอราคารออนุมัติ</h2>
          {s.quotePending.length === 0 ? (
            <p className="text-sm text-slate-400">ไม่มี</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {s.quotePending.slice(0, 8).map((d) => (
                <li key={d.id} className="flex justify-between py-2">
                  <Link href={`/documents/${d.id}`} className="hover:text-brand-600">
                    <div className="font-medium">{d.doc_no}</div>
                    <div className="text-xs text-slate-500">{d.customer_name}</div>
                  </Link>
                  <span className="num">{money(d.net_total)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card overflow-x-auto">
        <h2 className="mb-3 font-semibold">รายการรอจ่าย</h2>
        {s.outstanding.length === 0 ? (
          <p className="text-sm text-slate-400">ไม่มีรายการค้างชำระ 🎉</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr className="border-b">
                <th className="py-2">เลขที่</th>
                <th>ประเภท</th>
                <th>ลูกค้า</th>
                <th>วันที่</th>
                <th>ครบกำหนด</th>
                <th className="text-right">ยอดชำระ</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {s.outstanding.map((d) => {
                const late = d.due_date && d.due_date < today;
                return (
                  <tr key={d.id} className="border-b border-slate-100">
                    <td className="py-2 font-medium">
                      <Link href={`/documents/${d.id}`} className="hover:text-brand-600">{d.doc_no}</Link>
                    </td>
                    <td>
                      <span className={`badge ${DOC_TYPES[d.doc_type].color}`}>
                        {DOC_TYPES[d.doc_type].short}
                        {d.installment_no ? ` งวด ${d.installment_no}/${d.installment_count ?? "?"}` : ""}
                      </span>
                    </td>
                    <td>{d.customer_name}</td>
                    <td>{thDate(d.issue_date)}</td>
                    <td className={late ? "font-medium text-rose-600" : ""}>
                      {thDate(d.due_date)} {late && "(เกินกำหนด)"}
                    </td>
                    <td className="num text-right font-medium">{money(d.net_total)}</td>
                    <td className="text-right">
                      <Link href={`/documents/new?type=receipt&from=${d.id}`} className="text-xs text-brand-600 hover:underline">
                        ออกใบเสร็จ
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone, sub }: { label: string; value: number; tone: string; sub?: string }) {
  return (
    <div className="card">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`num mt-1 text-2xl font-semibold ${tone}`}>฿{money(value)}</div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}
