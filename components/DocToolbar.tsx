"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CONVERT_TO, DOC_TYPES, statusLabel, statusOptions } from "@/lib/docTypes";
import type { DocStatus, DocType } from "@/lib/types";

export default function DocToolbar({
  id,
  type,
  status,
  withCopy,
  issueDate,
}: {
  id: string;
  type: DocType;
  status: DocStatus;
  withCopy: boolean;
  issueDate: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);

  async function changeStatus(s: DocStatus) {
    setBusy(true);
    await supabase
      .from("documents")
      .update({ status: s, paid_date: s === "paid" ? issueDate : null })
      .eq("id", id);
    setBusy(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm("ลบเอกสารนี้ถาวร?")) return;
    setBusy(true);
    const { error } = await supabase.from("documents").delete().eq("id", id);
    if (error) {
      alert(error.message);
      setBusy(false);
      return;
    }
    router.push(`/documents?type=${type}`);
    router.refresh();
  }

  return (
    <div className="no-print mb-4 flex flex-wrap items-center gap-2">
      <Link href={`/documents?type=${type}`} className="btn-ghost">‹ กลับ</Link>
      <button className="btn-primary" onClick={() => window.print()}>พิมพ์ / บันทึก PDF</button>
      <Link href={`/documents/${id}${withCopy ? "" : "?copy=1"}`} className="btn-ghost">
        {withCopy ? "พิมพ์เฉพาะต้นฉบับ" : "พิมพ์ต้นฉบับ + สำเนา"}
      </Link>
      <Link href={`/documents/${id}/edit`} className="btn-ghost">แก้ไข</Link>
      {CONVERT_TO[type].map((t) => (
        <Link key={t} href={`/documents/new?type=${t}&from=${id}`} className="btn-ghost">
          → {DOC_TYPES[t].short}
        </Link>
      ))}
      <div className="ml-auto flex items-center gap-2">
        <select
          className="input w-40"
          value={status}
          disabled={busy}
          onChange={(e) => changeStatus(e.target.value as DocStatus)}
        >
          {statusOptions(type).map((s) => (
            <option key={s} value={s}>{statusLabel(type, s)}</option>
          ))}
        </select>
        <button className="btn-danger" onClick={remove} disabled={busy}>ลบ</button>
      </div>
    </div>
  );
}
