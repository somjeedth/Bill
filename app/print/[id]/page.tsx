// หน้าเอกสารสำหรับพิมพ์/แปลงเป็น PDF — เปิดได้ด้วยลิงก์ที่มี token (?t=...) เท่านั้น
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DocumentPaper from "@/components/DocumentPaper";
import { verifyPdfToken } from "@/lib/pdfToken";
import { loadPrintData } from "@/lib/printData";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string; copy?: string }>;
}) {
  const { id } = await params;
  const { t, copy } = await searchParams;
  if (!verifyPdfToken(id, t)) notFound();

  const data = await loadPrintData(createAdminClient(), id);
  if (!data) notFound();
  const withCopy = copy === "1";

  return (
    <main className="print-root bg-white">
      <DocumentPaper {...data} copyLabel={withCopy ? "ต้นฉบับ" : undefined} />
      {withCopy && (
        <div className="print-page-break">
          <DocumentPaper {...data} copyLabel="สำเนา" />
        </div>
      )}
    </main>
  );
}
