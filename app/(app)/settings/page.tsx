"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EMPTY_COMPANY, type CompanySettings } from "@/lib/types";
import McpTokens from "@/components/McpTokens";

type ImgKey = "logo_path" | "signature_path" | "qr_path";

export default function SettingsPage() {
  const supabase = createClient();
  const [form, setForm] = useState<CompanySettings>(EMPTY_COMPANY);
  const [previews, setPreviews] = useState<Record<ImgKey, string | null>>({
    logo_path: null,
    signature_path: null,
    qr_path: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<ImgKey | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function sign(path: string | null) {
    if (!path) return null;
    const { data } = await supabase.storage.from("company-assets").createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("company_settings").select("*").maybeSingle();
      if (data) {
        const c = { ...EMPTY_COMPANY, ...data } as CompanySettings;
        setForm(c);
        setPreviews({
          logo_path: await sign(c.logo_path),
          signature_path: await sign(c.signature_path),
          qr_path: await sign(c.qr_path),
        });
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof CompanySettings>(k: K, v: CompanySettings[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function upload(key: ImgKey, file: File) {
    setUploading(key);
    setMsg(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${user.id}/${key.replace("_path", "")}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("company-assets")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      setMsg("อัปโหลดไม่สำเร็จ: " + error.message);
    } else {
      const old = form[key];
      if (old) await supabase.storage.from("company-assets").remove([old]);
      set(key, path);
      setPreviews((p) => ({ ...p, [key]: URL.createObjectURL(file) }));
      // บันทึก path ทันที กันไฟล์หลุด
      await supabase.from("company_settings").upsert({ ...form, [key]: path, user_id: user.id });
    }
    setUploading(null);
  }

  async function removeImg(key: ImgKey) {
    const old = form[key];
    if (old) await supabase.storage.from("company-assets").remove([old]);
    set(key, null);
    setPreviews((p) => ({ ...p, [key]: null }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("company_settings")
      .upsert({ ...form, user_id: user!.id, default_vat_rate: Number(form.default_vat_rate) || 0 });
    setMsg(error ? "บันทึกไม่สำเร็จ: " + error.message : "บันทึกเรียบร้อย ✓");
    setSaving(false);
  }

  if (loading) return <p className="text-slate-500">กำลังโหลด…</p>;

  const text = (k: keyof CompanySettings, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="label">{label}</label>
      <input className="input" value={String(form[k] ?? "")} onChange={(e) => set(k, e.target.value as never)} {...props} />
    </div>
  );

  return (
    <div className="space-y-6">
    <form onSubmit={save} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">ข้อมูลบริษัท</h1>
        <div className="flex items-center gap-3">
          {msg && <span className="text-sm text-slate-600">{msg}</span>}
          <button className="btn-primary" disabled={saving}>{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
        </div>
      </div>

      <section className="card grid gap-4 md:grid-cols-2">
        <h2 className="font-semibold md:col-span-2">ข้อมูลทั่วไป</h2>
        {text("company_name", "ชื่อบริษัท / ชื่อผู้ประกอบการ *", { required: true })}
        <div className="grid grid-cols-2 gap-3">
          {text("tax_id", "เลขประจำตัวผู้เสียภาษี", { maxLength: 13, inputMode: "numeric" })}
          {text("branch", "สาขา")}
        </div>
        <div className="md:col-span-2">
          <label className="label">ที่อยู่บริษัท</label>
          <textarea className="input" rows={3} value={form.address} onChange={(e) => set("address", e.target.value)} />
        </div>
        {text("phone", "โทรศัพท์")}
        {text("email", "อีเมล", { type: "email" })}
        {text("website", "เว็บไซต์")}
        {text("default_vat_rate", "อัตรา VAT เริ่มต้น (%)", { type: "number", step: "0.01", min: 0 })}
        <div className="md:col-span-2">
          <label className="label">หมายเหตุเริ่มต้นในเอกสาร</label>
          <textarea className="input" rows={2} value={form.default_notes} onChange={(e) => set("default_notes", e.target.value)} />
        </div>
      </section>

      <section className="card grid gap-4 md:grid-cols-2">
        <h2 className="font-semibold md:col-span-2">ผู้มีอำนาจลงนาม</h2>
        {text("signer_name", "ชื่อกรรมการ / ผู้ลงนาม")}
        {text("signer_title", "ตำแหน่ง")}
      </section>

      <section className="card grid gap-4 md:grid-cols-2">
        <h2 className="font-semibold md:col-span-2">บัญชีรับชำระเงิน</h2>
        {text("bank_name", "ธนาคาร")}
        {text("bank_branch", "สาขาธนาคาร")}
        {text("bank_account_name", "ชื่อบัญชี")}
        {text("bank_account_no", "เลขที่บัญชี")}
      </section>

      <section className="card grid gap-6 md:grid-cols-3">
        <h2 className="font-semibold md:col-span-3">รูปภาพ (PNG/JPG/WebP ไม่เกิน 2MB)</h2>
        <ImageBox
          title="โลโก้บริษัท"
          src={previews.logo_path}
          busy={uploading === "logo_path"}
          onPick={(f) => upload("logo_path", f)}
          onRemove={() => removeImg("logo_path")}
        />
        <ImageBox
          title="ลายเซ็นกรรมการ"
          hint="แนะนำ PNG พื้นหลังโปร่งใส"
          src={previews.signature_path}
          busy={uploading === "signature_path"}
          onPick={(f) => upload("signature_path", f)}
          onRemove={() => removeImg("signature_path")}
        />
        <ImageBox
          title="QR รับชำระเงิน (PromptPay)"
          src={previews.qr_path}
          busy={uploading === "qr_path"}
          onPick={(f) => upload("qr_path", f)}
          onRemove={() => removeImg("qr_path")}
        />
      </section>
    </form>
    <McpTokens />
    </div>
  );
}

function ImageBox({
  title,
  hint,
  src,
  busy,
  onPick,
  onRemove,
}: {
  title: string;
  hint?: string;
  src: string | null;
  busy: boolean;
  onPick: (f: File) => void;
  onRemove: () => void;
}) {
  return (
    <div>
      <div className="label">{title}</div>
      <div className="flex h-40 items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 p-2">
        {busy ? (
          <span className="text-sm text-slate-400">กำลังอัปโหลด…</span>
        ) : src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={title} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-sm text-slate-400">ยังไม่มีรูป</span>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      <div className="mt-2 flex gap-2">
        <label className="btn-ghost cursor-pointer px-3 py-1.5">
          เลือกไฟล์
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPick(f);
              e.target.value = "";
            }}
          />
        </label>
        {src && (
          <button type="button" className="btn-danger px-3 py-1.5" onClick={onRemove}>
            ลบ
          </button>
        )}
      </div>
    </div>
  );
}
