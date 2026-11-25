"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface TokenRow {
  id: string;
  name: string;
  token_prefix: string;
  last_used_at: string | null;
  created_at: string;
}

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `bill_${b64}`;
}

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }) : "ยังไม่เคยใช้";

export default function McpTokens() {
  const supabase = createClient();
  const [rows, setRows] = useState<TokenRow[]>([]);
  const [name, setName] = useState("Grok bot");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  async function load() {
    const { data, error } = await supabase
      .from("api_tokens")
      .select("id, name, token_prefix, last_used_at, created_at")
      .order("created_at", { ascending: false });
    if (error) setErr("ยังไม่ได้รัน SQL 0002_mcp_tokens.sql หรือโหลดไม่สำเร็จ: " + error.message);
    else setRows((data ?? []) as TokenRow[]);
  }

  useEffect(() => {
    setOrigin(window.location.origin);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create() {
    setBusy(true);
    setErr(null);
    const token = randomToken();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("api_tokens").insert({
      user_id: user!.id,
      name: name.trim() || "MCP",
      token_prefix: token.slice(0, 10),
      token_hash: await sha256Hex(token),
    });
    if (error) setErr(error.message);
    else {
      setNewToken(token);
      load();
    }
    setBusy(false);
  }

  async function revoke(id: string) {
    if (!confirm("ยกเลิก token นี้? bot ที่ใช้อยู่จะเชื่อมต่อไม่ได้ทันที")) return;
    await supabase.from("api_tokens").delete().eq("id", id);
    load();
  }

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  const url = `${origin}/api/mcp`;

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="font-semibold">เชื่อมต่อ AI (MCP)</h2>
        <p className="text-sm text-slate-500">
          ให้ AI bot เช่น Grok ดูยอดค้างชำระ ค้นหา สร้าง และออกเอกสารต่อได้ผ่าน MCP
        </p>
      </div>

      <div>
        <label className="label">MCP Server URL</label>
        <div className="flex gap-2">
          <input className="input font-mono" readOnly value={url} />
          <button type="button" className="btn-ghost shrink-0" onClick={() => copy(url, "url")}>
            {copied === "url" ? "คัดลอกแล้ว ✓" : "คัดลอก"}
          </button>
        </div>
      </div>

      {newToken && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            คัดลอก token นี้เก็บไว้ตอนนี้เลย — ระบบจะไม่แสดงซ้ำอีก
          </p>
          <div className="flex gap-2">
            <input className="input font-mono text-xs" readOnly value={newToken} />
            <button type="button" className="btn-primary shrink-0" onClick={() => copy(newToken, "token")}>
              {copied === "token" ? "คัดลอกแล้ว ✓" : "คัดลอก"}
            </button>
          </div>
          <button type="button" className="text-xs text-amber-800 underline" onClick={() => setNewToken(null)}>
            เก็บแล้ว ซ่อน
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <label className="label">ชื่อ token (ไว้จำว่าใช้กับอะไร)</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button type="button" className="btn-primary" onClick={create} disabled={busy}>
          {busy ? "กำลังสร้าง…" : "+ สร้าง token"}
        </button>
      </div>
      {err && <p className="text-sm text-rose-600">{err}</p>}

      {rows.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr className="border-b">
              <th className="py-2">ชื่อ</th>
              <th>Token</th>
              <th>ใช้ล่าสุด</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="py-2">{r.name}</td>
                <td className="font-mono text-xs text-slate-500">{r.token_prefix}…</td>
                <td className="text-slate-500">{fmt(r.last_used_at)}</td>
                <td className="text-right">
                  <button type="button" className="text-rose-600 hover:underline" onClick={() => revoke(r.id)}>
                    ยกเลิก
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
