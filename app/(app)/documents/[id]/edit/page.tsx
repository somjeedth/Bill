import { notFound } from "next/navigation";
import DocumentForm, { type InstallmentContext } from "@/components/DocumentForm";
import { round2 } from "@/lib/calc";
import { itemsFromRows, toDraft } from "@/lib/draft";
import { createClient } from "@/lib/supabase/server";
import type { Customer, DocumentRow } from "@/lib/types";

export default async function EditDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: doc }, { data: customers }] = await Promise.all([
    supabase.from("documents").select("*, document_items(*)").eq("id", id).maybeSingle(),
    supabase.from("customers").select("*").order("name"),
  ]);
  if (!doc) notFound();

  let installment: InstallmentContext | null = null;
  if (doc.doc_type === "installment" && doc.reference_id) {
    const [{ data: src }, { data: sibs }] = await Promise.all([
      supabase.from("documents").select("*").eq("id", doc.reference_id).maybeSingle(),
      supabase
        .from("documents")
        .select("*")
        .eq("reference_id", doc.reference_id)
        .eq("doc_type", "installment")
        .neq("status", "cancelled")
        .neq("id", doc.id),
    ]);
    if (src) {
      const others = (sibs ?? []) as DocumentRow[];
      installment = {
        sourceNo: src.doc_no,
        sourceType: src.doc_type,
        base: round2(Number(src.subtotal) - Number(src.discount_amount)),
        sourceNet: Number(src.net_total),
        billedBefore: round2(others.reduce((s, d) => s + Number(d.subtotal) - Number(d.discount_amount), 0)),
        prevCount: others.length,
      };
    }
  }

  return (
    <DocumentForm
      initial={toDraft(doc as DocumentRow)}
      initialItems={itemsFromRows(doc.document_items ?? [])}
      customers={(customers ?? []) as Customer[]}
      installment={installment}
    />
  );
}
