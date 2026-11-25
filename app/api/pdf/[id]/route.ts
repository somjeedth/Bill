// ดาวน์โหลดเอกสารเป็น PDF:  /api/pdf/<id>?t=<token>[&download=1][&copy=1]
import { NextResponse, type NextRequest } from "next/server";
import { verifyPdfToken } from "@/lib/pdfToken";
import { renderPdf } from "@/lib/pdfRender";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sp = req.nextUrl.searchParams;
  const token = sp.get("t");
  if (!verifyPdfToken(id, token)) {
    return NextResponse.json({ error: "ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว" }, { status: 403 });
  }

  const db = createAdminClient();
  const { data: doc } = await db.from("documents").select("doc_no").eq("id", id).maybeSingle();
  if (!doc) return NextResponse.json({ error: "ไม่พบเอกสาร" }, { status: 404 });

  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || req.nextUrl.origin;
  const printUrl = `${base}/print/${id}?t=${encodeURIComponent(token!)}${sp.get("copy") === "1" ? "&copy=1" : ""}`;

  try {
    const pdf = await renderPdf(printUrl);
    const filename = `${doc.doc_no}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${sp.get("download") === "1" ? "attachment" : "inline"}; filename="${filename.replace(/[^\w.-]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    console.error("PDF render failed", e);
    return NextResponse.json({ error: "สร้าง PDF ไม่สำเร็จ", detail: (e as Error).message }, { status: 500 });
  }
}
