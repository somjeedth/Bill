import Link from "next/link";
import { notFound } from "next/navigation";
import DocToolbar from "@/components/DocToolbar";
import DocumentPaper from "@/components/DocumentPaper";
import { DOC_TYPES, STATUS_COLOR, statusLabel } from "@/lib/docTypes";
import { itemsFromRows } from "@/lib/draft";
import { money, thDate } from "@/lib/format";
import { createClient, signedAssetUrl } from "@/lib/supabase/server";
import { pdfUrls, signPdfToken } from "@/lib/pdfToken";
import { headers } from "next/headers";
import { EMPTY_COMPANY, type CompanySettings, type DocumentRow } from "@/lib/types";

export default async function DocumentView({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ copy?: string }>;
}) {
  const { id } = await params;
  const { copy } = await searchParams;
  const supabase = await createClient();

  const [{ data: doc }, { data: companyRow }, { data: children }] = await Promise.all([
    supabase.from("documents").select("*, document_items(*)").eq("id", id).maybeSingle(),
    supabase.from("company_settings").select("*").maybeSingle(),
    supabase
      .from("documents")
      .select("id, doc_type, doc_no, issue_date, status, net_total, installment_no, installment_count")
      .eq("reference_id", id)
      .order("issue_date"),
  ]);
  if (!doc) notFound();

  const company = { ...EMPTY_COMPANY, ...(companyRow ?? {}) } as CompanySettings;
  const [logo, signature, stamp, qr] = await Promise.all([
    signedAssetUrl(supabase, company.logo_path),
    signedAssetUrl(supabase, company.signature_path),
    signedAssetUrl(supabase, company.stamp_path),
    signedAssetUrl(supabase, company.qr_path),
  ]);

  let reference: { id: string; doc_no: string; doc_type: DocumentRow["doc_type"] } | null = null;
  if (doc.reference_id) {
    const { data } = await supabase
      .from("documents")
      .select("id, doc_no, doc_type")
      .eq("id", doc.reference_id)
      .maybeSingle();
    reference = data;
  }

  const d = doc as DocumentRow;
  const items = itemsFromRows(doc.document_items ?? []);
  const images = { logo, signature, stamp, qr };
  const withCopy = copy === "1";
  const kids = (children ?? []) as DocumentRow[];

  // ลิงก์ PDF (อายุ 7 วัน) สำหรับดาวน์โหลด/ส่งให้ลูกค้า
  const h = await headers();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const signed = signPdfToken(d.id);
  const pdf = signed ? pdfUrls(origin, d.id, signed.token, withCopy) : null;

  return (
    <div>
      <DocToolbar
        id={d.id}
        type={d.doc_type}
        status={d.status}
        withCopy={withCopy}
        issueDate={d.issue_date}
        pdfDownloadUrl={pdf?.download}
        pdfShareUrl={pdf?.view}
      />

      <div className="no-print mb-4 flex flex-wrap items-center gap-3 text-sm">
        <span className={`badge ${DOC_TYPES[d.doc_type].color}`}>{DOC_TYPES[d.doc_type].th}</span>
        <span className={`badge ${STATUS_COLOR[d.status]}`}>{statusLabel(d.doc_type, d.status)}</span>
        {reference && (
          <span className="text-slate-500">
            อ้างอิงจาก{" "}
            <Link className="text-brand-600 hover:underline" href={`/documents/${reference.id}`}>
              {DOC_TYPES[reference.doc_type].short} {reference.doc_no}
            </Link>
          </span>
        )}
      </div>

      {kids.length > 0 && (
        <div className="no-print card mb-4 p-4">
          <div className="mb-2 text-sm font-semibold">เอกสารที่ออกต่อจากฉบับนี้</div>
          <table className="w-full text-sm">
            <tbody>
              {kids.map((k) => (
                <tr key={k.id} className="border-t border-slate-100">
                  <td className="py-1.5">
                    <Link href={`/documents/${k.id}`} className="font-medium text-brand-700 hover:underline">{k.doc_no}</Link>
                  </td>
                  <td>
                    {DOC_TYPES[k.doc_type].short}
                    {k.installment_no ? ` งวด ${k.installment_no}/${k.installment_count ?? "?"}` : ""}
                  </td>
                  <td>{thDate(k.issue_date)}</td>
                  <td><span className={`badge ${STATUS_COLOR[k.status]}`}>{statusLabel(k.doc_type, k.status)}</span></td>
                  <td className="num text-right">{money(k.net_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="overflow-x-auto pb-8">
        <DocumentPaper
          doc={d}
          items={items}
          company={company}
          images={images}
          referenceNo={reference?.doc_no}
          copyLabel={withCopy ? "ต้นฉบับ" : undefined}
        />
        {withCopy && (
          <div className="print-page-break mt-8">
            <DocumentPaper
              doc={d}
              items={items}
              company={company}
              images={images}
              referenceNo={reference?.doc_no}
              copyLabel="สำเนา"
            />
          </div>
        )}
      </div>
    </div>
  );
}
