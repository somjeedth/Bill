"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const LINKS = [
  { href: "/", label: "แดชบอร์ด" },
  { href: "/documents?type=quotation", label: "ใบเสนอราคา", match: "quotation" },
  { href: "/documents?type=invoice", label: "ใบวางบิล", match: "invoice" },
  { href: "/documents?type=installment", label: "ใบแบ่งจ่าย", match: "installment" },
  { href: "/documents?type=receipt", label: "ใบเสร็จ", match: "receipt" },
  { href: "/customers", label: "ลูกค้า" },
  { href: "/settings", label: "ข้อมูลบริษัท" },
];

export default function Nav({ email }: { email: string }) {
  const pathname = usePathname();
  const typeParam = useSearchParams().get("type") ?? undefined;
  const router = useRouter();

  async function logout() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">฿</span>
          ระบบบัญชี
        </Link>
        <nav className="flex flex-1 flex-wrap gap-1 text-sm">
          {LINKS.map((l) => {
            const active = l.match
              ? pathname.startsWith("/documents") && typeParam === l.match
              : l.href === "/"
                ? pathname === "/"
                : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-md px-3 py-1.5 ${
                  active ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span className="hidden md:inline">{email}</span>
          <button onClick={logout} className="btn-ghost px-3 py-1.5">
            ออกจากระบบ
          </button>
        </div>
      </div>
    </header>
  );
}
