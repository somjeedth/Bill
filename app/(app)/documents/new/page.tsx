import DocumentForm from "@/components/DocumentForm";
import { DOC_TYPE_LIST } from "@/lib/docTypes";
import { blankDraft, draftFromSource, itemsFromRows } from "@/lib/draft";
import { createClient } from "@/lib/supabase/server";
import type { Customer, DocItem, DocType, DocumentRow } from "@/lib/types";

export default async function NewDocumentPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; from?: string }>;
}) {
  const sp = await searchParams;
  const type: DocType = (DOC_TYPE_LIST as string[]).includes(sp.type ?? "")
    ? (sp.type as DocType)
    : "quotation";

  const supabase = await createClient();
  const [{ data: customers }, { data: company }] = await Promise.all([
    supabase.from("customers").select("*").order("name"),
    supabase.from("company_settings").select("default_vat_rate, default_notes").maybeSingle(),
  ]);

  let draft = blankDraft(type, company);
  let items: DocItem[] = [];
  let installment = null;

  if (sp.from) {
    const { data: src } = await supabase
      .from("documents")
      .select("*, document_items(*)")
      .eq("id", sp.from)
      .maybeSingle();
    if (src) {
      let prev: DocumentRow[] = [];
      if (type === "installment") {
        const { data } = await supabase
          .from("documents")
          .select("*")
          .eq("reference_id", src.id)
          .eq("doc_type", "installment")
          .neq("status", "cancelled");
        prev = (data ?? []) as DocumentRow[];
      }
      const r = draftFromSource(
        type,
        src as DocumentRow,
        itemsFromRows(src.document_items ?? []),
        company,
        prev
      );
      draft = r.draft;
      items = r.items;
      installment = r.installment;
    }
  }

  return (
    <DocumentForm
      key={`${type}-${sp.from ?? ""}`}
      initial={draft}
      initialItems={items}
      customers={(customers ?? []) as Customer[]}
      installment={installment}
      lockType={!!sp.from}
    />
  );
}
