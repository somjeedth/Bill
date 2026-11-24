"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { calcTotals, lineAmount, round2 } from "@/lib/calc";
import { DOC_TYPES, DOC_TYPE_LIST, statusLabel, statusOptions } from "@/lib/docTypes";
import { addDaysISO, bahtText, money } from "@/lib/format";
import type { Customer, DocItem, DocType, DocumentRow } from "@/lib/types";

export type DocDraft = Omit<
  DocumentRow,
  "id" | "subtotal" | "discount_amount" | "vat_amount" | "grand_total" | "wht_amount" | "net_total"
> & { id?: string };

export interface InstallmentContext {
  sourceNo: string;
  sourceType: DocType;
  /** ยอดก่อน VAT หลังหักส่วนลดของเอกสารต้นทาง */
  base: number;
  sourceNet: number;
  billedBefore: number; // ยอด (ก่อน VAT) ของงวดก่อนหน้า
  prevCount: number;
}

const WHT_PRESETS = [0, 1, 2, 3, 5];
const emptyItem = (): DocItem => ({ description: "", quantity: 1, unit: "", unit_price: 0 });

export default function DocumentForm({
  initial,
  initialItems,
  customers,
  installment,
  lockType,
}: {
  initial: DocDraft;
  initialItems: DocItem[];
  customers: Customer[];
  installment?: InstallmentContext | null;
  lockType?: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [doc, setDoc] = useState<DocDraft>(initial);
  const [items, setItems] = useState<DocItem[]>(initialItems.length ? initialItems : [emptyItem()]);
  const [saveCustomer, setSaveCustomer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ตัวช่วยแบ่งงวด
  const [instMode, setInstMode] = useState<"percent" | "amount">("percent");
  const [instValue, setInstValue] = useState<number>(
    installment ? Math.round(100 / Math.max(1, doc.installment_count ?? 2)) : 0
  );

  const isNew = !doc.id;
  const meta = DOC_TYPES[doc.doc_type];
  const totals = useMemo(
    () =>
      calcTotals({
        items,
        discount_type: doc.discount_type,
        discount_value: doc.discount_value,
        vat_enabled: doc.vat_enabled,
        vat_rate: doc.vat_rate,
        wht_rate: doc.wht_rate,
      }),
    [items, doc.discount_type, doc.discount_value, doc.vat_enabled, doc.vat_rate, doc.wht_rate]
  );

  const set = <K extends keyof DocDraft>(k: K, v: DocDraft[K]) => setDoc((d) => ({ ...d, [k]: v }));
  const setItem = (i: number, patch: Partial<DocItem>) =>
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const move = (i: number, dir: -1 | 1) =>
    setItems((arr) => {
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      const c = [...arr];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });

  function pickCustomer(id: string) {
    const c = customers.find((x) => x.id === id);
    if (!c) return set("customer_id", null);
    setDoc((d) => ({
      ...d,
      customer_id: c.id,
      customer_name: c.name,
      customer_address: c.address,
      customer_tax_id: c.tax_id,
      customer_branch: c.branch,
      customer_contact: [c.contact, c.phone].filter(Boolean).join(" "),
    }));
    setSaveCustomer(false);
  }

  function applyInstallment() {
    if (!installment) return;
    const n = doc.installment_no ?? installment.prevCount + 1;
    const cnt = doc.installment_count ?? n;
    const pct = instMode === "percent" ? instValue : (instValue / (installment.base || 1)) * 100;
    const amount =
      instMode === "percent" ? round2((installment.base * instValue) / 100) : round2(instValue);
    const label =
      `ค่างวดที่ ${n}/${cnt} (${round2(pct)}%) ` +
      `ตาม${DOC_TYPES[installment.sourceType].th.split(" /")[0]}เลขที่ ${installment.sourceNo}`;
    setItems([{ description: label, quantity: 1, unit: "งวด", unit_price: amount }]);
    setDoc((d) => ({ ...d, discount_value: 0, discount_type: "amount" }));
  }

  function changeType(t: DocType) {
    setDoc((d) => ({
      ...d,
      doc_type: t,
      status: t === "receipt" ? "paid" : "pending",
      due_date: t === "receipt" ? null : d.due_date ?? addDaysISO(d.issue_date, 30),
    }));
  }

  async function save() {
    setErr(null);
    if (!doc.customer_name.trim()) return setErr("กรุณาระบุชื่อลูกค้า");
    const cleanItems = items.filter((it) => it.description.trim() || Number(it.unit_price));
    if (!cleanItems.length) return setErr("กรุณาเพิ่มรายการอย่างน้อย 1 รายการ");
    setSaving(true);
    try {
      let customer_id = doc.customer_id;
      if (saveCustomer && !customer_id) {
        const { data: c, error } = await supabase
          .from("customers")
          .insert({
            name: doc.customer_name,
            address: doc.customer_address,
            tax_id: doc.customer_tax_id,
            branch: doc.customer_branch,
            contact: doc.customer_contact,
          })
          .select("id")
          .single();
        if (error) throw error;
        customer_id = c.id;
      }

      let doc_no = doc.doc_no.trim();
      if (!doc_no) {
        const { data, error } = await supabase.rpc("next_doc_no", {
          p_type: doc.doc_type,
          p_date: doc.issue_date,
        });
        if (error) throw error;
        doc_no = data as string;
      }

      const { id: _id, ...rest } = doc;
      void _id;
      const row = {
        ...rest,
        doc_no,
        customer_id,
        due_date: doc.due_date || null,
        paid_date: doc.status === "paid" ? doc.paid_date || doc.issue_date : null,
        discount_value: Number(doc.discount_value) || 0,
        vat_rate: Number(doc.vat_rate) || 0,
        wht_rate: Number(doc.wht_rate) || 0,
        subtotal: totals.subtotal,
        discount_amount: totals.discount_amount,
        vat_amount: totals.vat_amount,
        grand_total: totals.grand_total,
        wht_amount: totals.wht_amount,
        net_total: totals.net_total,
      };

      let id = doc.id;
      if (id) {
        const { error } = await supabase.from("documents").update(row).eq("id", id);
        if (error) throw error;
        const { error: delErr } = await supabase.from("document_items").delete().eq("document_id", id);
        if (delErr) throw delErr;
      } else {
        const { data, error } = await supabase.from("documents").insert(row).select("id").single();
        if (error) throw error;
        id = data.id as string;
      }

      const { error: itemErr } = await supabase.from("document_items").insert(
        cleanItems.map((it, i) => ({
          document_id: id,
          sort_order: i,
          description: it.description,
          quantity: Number(it.quantity) || 0,
          unit: it.unit,
          unit_price: Number(it.unit_price) || 0,
          amount: lineAmount(it),
        }))
      );
      if (itemErr) throw itemErr;

      if (isNew && doc.reference_id) await updateSourceStatus(doc.reference_id, doc.doc_type);

      router.push(`/documents/${id}`);
      router.refresh();
    } catch (e) {
      const m = (e as { message?: string }).message ?? String(e);
      setErr(m.includes("duplicate") ? "เลขที่เอกสารนี้มีอยู่แล้ว" : m);
      setSaving(false);
    }
  }

  /** อัปเดตสถานะเอกสารต้นทางหลังแปลงเอกสาร */
  async function updateSourceStatus(refId: string, newType: DocType) {
    const { data: src } = await supabase
      .from("documents")
      .select("id, doc_type, reference_id")
      .eq("id", refId)
      .single();
    if (!src) return;
    if (src.doc_type === "quotation" && newType !== "receipt") {
      await supabase.from("documents").update({ status: "approved" }).eq("id", refId);
    }
    if (newType === "receipt") {
      await supabase
        .from("documents")
        .update({ status: "paid", paid_date: doc.issue_date })
        .eq("id", refId);
      // ถ้าเป็นใบแบ่งจ่าย และทุกงวดชำระครบ → ปิดใบวางบิลแม่
      if (src.doc_type === "installment" && src.reference_id) {
        const { data: sibs } = await supabase
          .from("documents")
          .select("status, installment_count")
          .eq("reference_id", src.reference_id)
          .eq("doc_type", "installment")
          .neq("status", "cancelled");
        const all = sibs ?? [];
        const expected = Math.max(...all.map((s) => s.installment_count ?? 0), all.length);
        if (all.length >= expected && all.every((s) => s.status === "paid")) {
          await supabase
            .from("documents")
            .update({ status: "paid", paid_date: doc.issue_date })
            .eq("id", src.reference_id);
        }
      }
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {isNew ? "สร้าง" : "แก้ไข"}
          {meta.th}
        </h1>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => router.back()} disabled={saving}>ยกเลิก</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </div>
      {err && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">{err}</div>}

      {/* ---------- ข้อมูลเอกสาร ---------- */}
      <section className="card grid gap-4 md:grid-cols-5">
        <div>
          <label className="label">ประเภทเอกสาร</label>
          <select
            className="input"
            value={doc.doc_type}
            disabled={lockType || !isNew}
            onChange={(e) => changeType(e.target.value as DocType)}
          >
            {DOC_TYPE_LIST.map((t) => (
              <option key={t} value={t}>{DOC_TYPES[t].th}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">เลขที่เอกสาร</label>
          <input
            className="input"
            placeholder="อัตโนมัติ"
            value={doc.doc_no}
            onChange={(e) => set("doc_no", e.target.value)}
          />
        </div>
        <div>
          <label className="label">วันที่</label>
          <input type="date" className="input" value={doc.issue_date} onChange={(e) => set("issue_date", e.target.value)} />
        </div>
        {doc.doc_type !== "receipt" ? (
          <div>
            <label className="label">{doc.doc_type === "quotation" ? "ยืนราคาถึง" : "ครบกำหนดชำระ"}</label>
            <input
              type="date"
              className="input"
              value={doc.due_date ?? ""}
              onChange={(e) => set("due_date", e.target.value || null)}
            />
          </div>
        ) : (
          <div>
            <label className="label">ชำระโดย</label>
            <input
              className="input"
              list="pay-methods"
              value={doc.payment_method}
              onChange={(e) => set("payment_method", e.target.value)}
            />
            <datalist id="pay-methods">
              <option value="เงินสด" />
              <option value="โอนเงิน" />
              <option value="เช็ค" />
              <option value="บัตรเครดิต" />
            </datalist>
          </div>
        )}
        <div>
          <label className="label">สถานะ</label>
          <select className="input" value={doc.status} onChange={(e) => set("status", e.target.value as DocDraft["status"])}>
            {statusOptions(doc.doc_type).map((s) => (
              <option key={s} value={s}>{statusLabel(doc.doc_type, s)}</option>
            ))}
          </select>
        </div>
        {doc.doc_type === "installment" && (
          <div className="grid grid-cols-2 gap-3 md:col-span-2">
            <div>
              <label className="label">งวดที่</label>
              <input
                type="number"
                min={1}
                className="input"
                value={doc.installment_no ?? ""}
                onChange={(e) => set("installment_no", e.target.value ? Number(e.target.value) : null)}
              />
            </div>
            <div>
              <label className="label">จากทั้งหมด (งวด)</label>
              <input
                type="number"
                min={1}
                className="input"
                value={doc.installment_count ?? ""}
                onChange={(e) => set("installment_count", e.target.value ? Number(e.target.value) : null)}
              />
            </div>
          </div>
        )}
      </section>

      {/* ---------- ตัวช่วยแบ่งงวด ---------- */}
      {doc.doc_type === "installment" && installment && (
        <section className="card border-violet-200 bg-violet-50/50">
          <h2 className="mb-1 font-semibold">แบ่งจ่ายจาก {installment.sourceNo}</h2>
          <p className="mb-3 text-sm text-slate-600">
            ยอดก่อน VAT <b className="num">{money(installment.base)}</b> · ยอดสุทธิ{" "}
            <b className="num">{money(installment.sourceNet)}</b> · เรียกเก็บไปแล้ว {installment.prevCount} งวด (
            <span className="num">{money(installment.billedBefore)}</span>) · คงเหลือ{" "}
            <b className="num">{money(installment.base - installment.billedBefore)}</b>
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex overflow-hidden rounded-lg border border-slate-300 text-sm">
              {(["percent", "amount"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setInstMode(m)}
                  className={`px-3 py-2 ${instMode === m ? "bg-violet-600 text-white" : "bg-white"}`}
                >
                  {m === "percent" ? "%" : "บาท"}
                </button>
              ))}
            </div>
            <div>
              <label className="label">{instMode === "percent" ? "เปอร์เซ็นต์ของงวดนี้" : "จำนวนเงินงวดนี้ (ก่อน VAT)"}</label>
              <input
                type="number"
                step="0.01"
                className="input w-44"
                value={instValue}
                onChange={(e) => setInstValue(Number(e.target.value))}
              />
            </div>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setInstMode("amount");
                setInstValue(round2(installment.base - installment.billedBefore));
              }}
            >
              ใช้ยอดคงเหลือ
            </button>
            <button type="button" className="btn-primary bg-violet-600 hover:bg-violet-700" onClick={applyInstallment}>
              สร้างรายการงวดนี้
            </button>
          </div>
        </section>
      )}

      {/* ---------- ลูกค้า ---------- */}
      <section className="card grid gap-4 md:grid-cols-2">
        <div className="flex items-center justify-between md:col-span-2">
          <h2 className="font-semibold">ลูกค้า</h2>
          <select className="input w-72" value={doc.customer_id ?? ""} onChange={(e) => pickCustomer(e.target.value)}>
            <option value="">— เลือกจากรายชื่อลูกค้า —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">ชื่อลูกค้า *</label>
          <input className="input" value={doc.customer_name} onChange={(e) => set("customer_name", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">เลขผู้เสียภาษี</label>
            <input className="input" value={doc.customer_tax_id} onChange={(e) => set("customer_tax_id", e.target.value)} />
          </div>
          <div>
            <label className="label">สาขา</label>
            <input className="input" value={doc.customer_branch} onChange={(e) => set("customer_branch", e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">ที่อยู่</label>
          <textarea className="input" rows={2} value={doc.customer_address} onChange={(e) => set("customer_address", e.target.value)} />
        </div>
        <div>
          <label className="label">ผู้ติดต่อ / โทร</label>
          <input className="input" value={doc.customer_contact} onChange={(e) => set("customer_contact", e.target.value)} />
          {!doc.customer_id && (
            <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={saveCustomer} onChange={(e) => setSaveCustomer(e.target.checked)} />
              บันทึกเป็นลูกค้าใหม่
            </label>
          )}
        </div>
      </section>

      {/* ---------- รายการ ---------- */}
      <section className="card overflow-x-auto">
        <h2 className="mb-3 font-semibold">รายการ</h2>
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="w-8 py-2">#</th>
              <th>รายละเอียด</th>
              <th className="w-24 text-right">จำนวน</th>
              <th className="w-24">หน่วย</th>
              <th className="w-32 text-right">ราคา/หน่วย</th>
              <th className="w-32 text-right">จำนวนเงิน</th>
              <th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-t border-slate-100 align-top">
                <td className="py-2 text-slate-400">{i + 1}</td>
                <td className="py-1 pr-2">
                  <textarea
                    className="input min-h-9"
                    rows={1}
                    value={it.description}
                    onChange={(e) => setItem(i, { description: e.target.value })}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    type="number"
                    step="any"
                    className="input text-right"
                    value={it.quantity}
                    onChange={(e) => setItem(i, { quantity: e.target.value as unknown as number })}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input className="input" value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} />
                </td>
                <td className="py-1 pr-2">
                  <input
                    type="number"
                    step="any"
                    className="input text-right"
                    value={it.unit_price}
                    onChange={(e) => setItem(i, { unit_price: e.target.value as unknown as number })}
                  />
                </td>
                <td className="num py-3 pr-2 text-right font-medium">{money(lineAmount(it))}</td>
                <td className="py-2 text-right whitespace-nowrap text-slate-400">
                  <button type="button" className="px-1 hover:text-slate-700" onClick={() => move(i, -1)} title="เลื่อนขึ้น">↑</button>
                  <button type="button" className="px-1 hover:text-slate-700" onClick={() => move(i, 1)} title="เลื่อนลง">↓</button>
                  <button
                    type="button"
                    className="px-1 hover:text-rose-600"
                    onClick={() => setItems((a) => (a.length > 1 ? a.filter((_, j) => j !== i) : [emptyItem()]))}
                    title="ลบ"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="btn-ghost mt-3" onClick={() => setItems((a) => [...a, emptyItem()])}>
          + เพิ่มรายการ
        </button>
      </section>

      {/* ---------- สรุปยอด ---------- */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card space-y-3">
          <h2 className="font-semibold">หมายเหตุ</h2>
          <textarea className="input" rows={6} value={doc.notes} onChange={(e) => set("notes", e.target.value)} />
        </section>

        <section className="card space-y-3 text-sm">
          <Row label="รวมเป็นเงิน" value={totals.subtotal} />

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span>ส่วนลด</span>
              <div className="flex overflow-hidden rounded-lg border border-slate-300">
                {(["percent", "amount"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => set("discount_type", m)}
                    className={`px-2.5 py-1 ${doc.discount_type === m ? "bg-brand-600 text-white" : "bg-white"}`}
                  >
                    {m === "percent" ? "%" : "฿"}
                  </button>
                ))}
              </div>
              <input
                type="number"
                step="any"
                min={0}
                className="input w-28 py-1 text-right"
                value={doc.discount_value}
                onChange={(e) => set("discount_value", e.target.value as unknown as number)}
              />
            </div>
            <span className="num text-rose-600">-{money(totals.discount_amount)}</span>
          </div>

          <Row label="ยอดหลังหักส่วนลด" value={totals.after_discount} muted />

          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={doc.vat_enabled} onChange={(e) => set("vat_enabled", e.target.checked)} />
              ภาษีมูลค่าเพิ่ม
              <input
                type="number"
                step="any"
                min={0}
                className="input w-20 py-1 text-right"
                disabled={!doc.vat_enabled}
                value={doc.vat_rate}
                onChange={(e) => set("vat_rate", e.target.value as unknown as number)}
              />
              %
            </label>
            <span className="num">{money(totals.vat_amount)}</span>
          </div>

          <Row label="จำนวนเงินรวมทั้งสิ้น" value={totals.grand_total} bold />

          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span>หักภาษี ณ ที่จ่าย</span>
              {WHT_PRESETS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => set("wht_rate", r)}
                  className={`rounded-md border px-2 py-0.5 text-xs ${
                    Number(doc.wht_rate) === r ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-300"
                  }`}
                >
                  {r === 0 ? "ไม่หัก" : `${r}%`}
                </button>
              ))}
              <input
                type="number"
                step="any"
                min={0}
                className="input w-20 py-1 text-right"
                value={doc.wht_rate}
                onChange={(e) => set("wht_rate", e.target.value as unknown as number)}
              />
              %
            </div>
            <span className="num text-rose-600">-{money(totals.wht_amount)}</span>
          </div>

          <div className="flex items-center justify-between border-t pt-3 text-base">
            <span className="font-semibold">ยอดชำระสุทธิ</span>
            <span className="num text-xl font-bold text-brand-700">฿{money(totals.net_total)}</span>
          </div>
          <p className="text-right text-xs text-slate-500">({bahtText(totals.net_total)})</p>
        </section>
      </div>
    </div>
  );
}

function Row({ label, value, bold, muted }: { label: string; value: number; bold?: boolean; muted?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""} ${muted ? "text-slate-500" : ""}`}>
      <span>{label}</span>
      <span className="num">{money(value)}</span>
    </div>
  );
}
