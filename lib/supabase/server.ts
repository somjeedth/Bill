import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // called from a Server Component — proxy refreshes the session
          }
        },
      },
    }
  );
}

/** Signed URL (1 ชม.) สำหรับรูปใน bucket company-assets */
export async function signedAssetUrl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  path: string | null | undefined
) {
  if (!path) return null;
  const { data } = await supabase.storage
    .from("company-assets")
    .createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
