import type { AdminClient } from "@/lib/supabase/admin";
import { itemsFromRows } from "@/lib/draft";
import { EMPTY_COMPANY, type CompanySettings, type DocItem, type DocumentRow } from "@/lib/types";
import type { PaperImages } from "@/components/DocumentPaper";

/** โหลดทุกอย่างที่ต้องใช้วาดเอกสาร 1 ฉบับ (ฝั่ง server ด้วย service_role) */
export async function loadPrintData(db: AdminClient, docId: string) {
  const { data: doc } = await db.from("documents").select("*, document_items(*)").eq("id", docId).maybeSingle();
  if (!doc) return null;
  const d = doc as DocumentRow & { user_id: string; document_items: (DocItem & { sort_order: number })[] };

  const [{ data: companyRow }, { data: ref }] = await Promise.all([
    db.from("company_settings").select("*").eq("user_id", d.user_id).maybeSingle(),
    d.reference_id
      ? db.from("documents").select("doc_no").eq("id", d.reference_id).eq("user_id", d.user_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const company = { ...EMPTY_COMPANY, ...(companyRow ?? {}) } as CompanySettings;

  const sign = async (path: string | null | undefined) => {
    if (!path) return null;
    const { data } = await db.storage.from("company-assets").createSignedUrl(path, 600);
    return data?.signedUrl ?? null;
  };
  const [logo, signature, stamp, qr] = await Promise.all([
    sign(company.logo_path),
    sign(company.signature_path),
    sign(company.stamp_path),
    sign(company.qr_path),
  ]);
  const images: PaperImages = { logo, signature, stamp, qr };

  return {
    doc: d as DocumentRow,
    items: itemsFromRows(d.document_items ?? []),
    company,
    images,
    referenceNo: (ref as { doc_no?: string } | null)?.doc_no ?? null,
  };
}
