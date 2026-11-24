"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Customer } from "@/lib/types";

const EMPTY: Omit<Customer, "id"> = {
  name: "",
  address: "",
  tax_id: "",
  branch: "สำนักงานใหญ่",
  contact: "",
  phone: "",
  email: "",
};

export default function CustomersPage() {
  const supabase = createClient();
  const [list, setList] = useState<Customer[]>([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<(Omit<Customer, "id"> & { id?: string }) | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("customers").select("*").order("name");
    setList((data ?? []) as Customer[]);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setErr(null);
    const { id, ...row } = editing;
    const { error } = id
      ? await supabase.from("customers").update(row).eq("id", id)
      : await supabase.from("customers").insert(row);
    if (error) return setErr(error.message);
    setEditing(null);
    load();
  }

  async function remove(id: string) {
    if (!confirm("ลบลูกค้ารายนี้? (เอกสารเดิมยังอยู่)")) return;
    await supabase.from("customers").delete().eq("id", id);
    load();
  }

  const filtered = list.filter((c) =>
    [c.name, c.tax_id, c.contact, c.phone].join(" ").toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">ลูกค้า</h1>
        <div className="flex gap-2">
          <input className="input w-60" placeholder="ค้นหา…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn-primary" onClick={() => setEditing({ ...EMPTY })}>+ เพิ่มลูกค้า</button>
        </div>
      </div>

      {editing && (
        <form onSubmit={save} className="card grid gap-3 md:grid-cols-2">
          <h2 className="font-semibold md:col-span-2">{editing.id ? "แก้ไขลูกค้า" : "ลูกค้าใหม่"}</h2>
          {(
            [
              ["name", "ชื่อลูกค้า / บริษัท *"],
              ["tax_id", "เลขประจำตัวผู้เสียภาษี"],
              ["branch", "สาขา"],
              ["contact", "ผู้ติดต่อ"],
              ["phone", "โทรศัพท์"],
              ["email", "อีเมล"],
            ] as const
          ).map(([k, label]) => (
            <div key={k}>
              <label className="label">{label}</label>
              <input
                className="input"
                required={k === "name"}
                value={editing[k]}
                onChange={(e) => setEditing({ ...editing, [k]: e.target.value })}
              />
            </div>
          ))}
          <div className="md:col-span-2">
            <label className="label">ที่อยู่</label>
            <textarea
              className="input"
              rows={2}
              value={editing.address}
              onChange={(e) => setEditing({ ...editing, address: e.target.value })}
            />
          </div>
          {err && <p className="text-sm text-rose-600 md:col-span-2">{err}</p>}
          <div className="flex gap-2 md:col-span-2">
            <button className="btn-primary">บันทึก</button>
            <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>ยกเลิก</button>
          </div>
        </form>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2">ชื่อ</th>
              <th>เลขผู้เสียภาษี</th>
              <th>ผู้ติดต่อ</th>
              <th>โทร</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">ยังไม่มีลูกค้า</td></tr>
            )}
            {filtered.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  <div className="font-medium">{c.name}</div>
                  <div className="line-clamp-1 text-xs text-slate-500">{c.address}</div>
                </td>
                <td>{c.tax_id}</td>
                <td>{c.contact}</td>
                <td>{c.phone}</td>
                <td className="space-x-3 pr-4 text-right whitespace-nowrap">
                  <button className="text-brand-600 hover:underline" onClick={() => setEditing({ ...c })}>แก้ไข</button>
                  <button className="text-rose-600 hover:underline" onClick={() => remove(c.id)}>ลบ</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
