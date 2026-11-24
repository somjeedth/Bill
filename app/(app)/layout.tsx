import { Suspense } from "react";
import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen">
      <Suspense>
        <Nav email={user.email ?? ""} />
      </Suspense>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
