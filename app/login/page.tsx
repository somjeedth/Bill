"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "err" | "ok"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg({ type: "err", text: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" });
      else {
        router.replace("/");
        router.refresh();
      }
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) setMsg({ type: "err", text: error.message });
      else if (data.session) {
        router.replace("/settings");
        router.refresh();
      } else setMsg({ type: "ok", text: "สมัครสำเร็จ กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ" });
    }
    setLoading(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-white p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <div className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-xl font-bold text-white">
            ฿
          </div>
          <h1 className="text-xl font-semibold">ระบบบัญชีและออกเอกสาร</h1>
          <p className="text-sm text-slate-500">
            {mode === "signin" ? "เข้าสู่ระบบ" : "สร้างบัญชีใหม่"}
          </p>
        </div>
        <div>
          <label className="label">อีเมล</label>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label">รหัสผ่าน</label>
          <input
            className="input"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {msg && (
          <p className={`text-sm ${msg.type === "err" ? "text-rose-600" : "text-emerald-600"}`}>{msg.text}</p>
        )}
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "กำลังดำเนินการ…" : mode === "signin" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
        </button>
        <p className="text-center text-sm text-slate-500">
          {mode === "signin" ? "ยังไม่มีบัญชี?" : "มีบัญชีแล้ว?"}{" "}
          <button
            type="button"
            className="font-medium text-brand-600 hover:underline"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? "สมัครสมาชิก" : "เข้าสู่ระบบ"}
          </button>
        </p>
      </form>
    </main>
  );
}
