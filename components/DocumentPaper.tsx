/* eslint-disable @next/next/no-img-element */
import { DOC_TYPES } from "@/lib/docTypes";
import { bahtText, money, thDate } from "@/lib/format";
import type { CompanySettings, DocItem, DocumentRow, DocType } from "@/lib/types";

export interface PaperImages {
  logo: string | null;
  signature: string | null;
  qr: string | null;
}

/** โทนสีเอกสาร */
const ACCENT = "text-[#E8833A]";
const ACCENT_BG = "bg-[#E8833A]";
const SOFT_BG = "bg-[#FDF1E7]";

const TITLE: Record<DocType, string> = {
  quotation: "ใบเสนอราคา",
  invoice: "ใบวางบิล / ใบแจ้งหนี้",
  installment: "ใบแจ้งหนี้แบ่งชำระ",
  receipt: "ใบเสร็จรับเงิน",
};

const TO_LABEL: Record<DocType, string> = {
  quotation: "เสนอราคาให้",
  invoice: "เรียกเก็บจาก",
  installment: "เรียกเก็บจาก",
  receipt: "ได้รับเงินจาก",
};

const LEFT_SIGN: Record<DocType, string> = {
  quotation: "ผู้อนุมัติสั่งซื้อ",
  invoice: "ผู้รับวางบิล",
  installment: "ผู้รับวางบิล",
  receipt: "ผู้จ่ายเงิน",
};

export default function DocumentPaper({
  doc,
  items,
  company,
  images,
  referenceNo,
  copyLabel,
}: {
  doc: DocumentRow;
  items: DocItem[];
  company: CompanySettings;
  images: PaperImages;
  referenceNo?: string | null;
  copyLabel?: string;
}) {
  const meta = DOC_TYPES[doc.doc_type];
  const isReceipt = doc.doc_type === "receipt";
  const showPayment = !isReceipt && (company.bank_account_no || images.qr);
  const hasDiscount = Number(doc.discount_amount) > 0;
  const hasWht = Number(doc.wht_rate) > 0;
  const afterDiscount = Number(doc.subtotal) - Number(doc.discount_amount);
  const contact = [
    company.email && `อีเมล ${company.email}`,
    company.phone && `โทร ${company.phone}`,
  ].filter(Boolean);

  return (
    <div className="paper relative shadow-lg">
      {copyLabel && (
        <div className="absolute top-[14mm] right-[14mm] rounded border border-slate-300 px-2 text-[11px] text-slate-500">
          {copyLabel}
        </div>
      )}

      {/* ---------- ชื่อเอกสาร ---------- */}
      <div className="text-center">
        <h1 className={`text-[26px] leading-tight font-bold ${ACCENT}`}>{TITLE[doc.doc_type]}</h1>
        <div className="text-[11px] tracking-[0.2em] text-slate-400 uppercase">{meta.en}</div>
      </div>

      {/* ---------- โลโก้ + ข้อมูลเอกสาร ---------- */}
      <div className="mt-5 flex items-start justify-between gap-6">
        <div className="flex items-center gap-3">
          {images.logo ? (
            <img src={images.logo} alt="logo" className="h-16 w-auto max-w-48 object-contain" />
          ) : (
            <div className="text-[20px] font-bold">{company.company_name}</div>
          )}
        </div>
        <table className="text-[12px]">
          <tbody>
            <Meta k="เลขที่" v={doc.doc_no} />
            <Meta k="วันที่" v={thDate(doc.issue_date)} />
            {doc.due_date && (
              <Meta k={doc.doc_type === "quotation" ? "ยืนราคาถึง" : "ครบกำหนด"} v={thDate(doc.due_date)} />
            )}
            {referenceNo && <Meta k="อ้างอิง" v={referenceNo} />}
            {doc.installment_no && (
              <Meta k="งวดที่" v={`${doc.installment_no}${doc.installment_count ? ` / ${doc.installment_count}` : ""}`} />
            )}
            {isReceipt && doc.payment_method && <Meta k="ชำระโดย" v={doc.payment_method} />}
          </tbody>
        </table>
      </div>

      {/* ---------- ผู้ออก / ลูกค้า ---------- */}
      <div className="mt-5 grid grid-cols-2 gap-4 text-[11.5px] leading-relaxed">
        <Party
          title="ออกโดย"
          name={company.company_name}
          address={company.address}
          taxId={company.tax_id}
          branch={company.branch}
        />
        <Party
          title={TO_LABEL[doc.doc_type]}
          name={doc.customer_name}
          address={doc.customer_address}
          taxId={doc.customer_tax_id}
          branch={doc.customer_branch}
          contact={doc.customer_contact}
        />
      </div>

      {/* ---------- รายการ ---------- */}
      <div className="mt-6 overflow-hidden rounded-md border border-[#F3D9C4]">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className={`${ACCENT_BG} text-white`}>
              <th className="px-3 py-2.5 text-left font-medium">รายการ</th>
              <th className="w-16 px-2 py-2.5 text-right font-medium">จำนวน</th>
              <th className="w-16 px-2 py-2.5 text-left font-medium">หน่วย</th>
              <th className="w-24 px-2 py-2.5 text-right font-medium">ราคา/หน่วย</th>
              <th className="w-28 px-3 py-2.5 text-right font-medium">จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className={`align-top ${i % 2 ? SOFT_BG : "bg-white"}`}>
                <td className="px-3 py-2.5">
                  <div className="flex gap-1.5">
                    <span>{i + 1}.</span>
                    <span className="whitespace-pre-line">{it.description}</span>
                  </div>
                </td>
                <td className="num px-2 py-2.5 text-right">{Number(it.quantity).toLocaleString("th-TH")}</td>
                <td className="px-2 py-2.5">{it.unit}</td>
                <td className="num px-2 py-2.5 text-right">฿{money(it.unit_price)}</td>
                <td className="num px-3 py-2.5 text-right">฿{money(Number(it.quantity) * Number(it.unit_price))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---------- หมายเหตุ / ยอดรวม ---------- */}
      <div className="avoid-break mt-6 grid grid-cols-[1fr_250px] gap-10 text-[12px]">
        <div className="space-y-5">
          {doc.notes && (
            <section>
              <h3 className={`mb-1 text-[13px] font-semibold ${ACCENT}`}>หมายเหตุ / เงื่อนไข</h3>
              <div className="whitespace-pre-line text-slate-600">{doc.notes}</div>
            </section>
          )}

          {showPayment && (
            <section>
              <h3 className={`mb-1.5 text-[13px] font-semibold ${ACCENT}`}>ช่องทางการชำระเงิน</h3>
              <div className="flex items-center gap-3">
                {images.qr && <img src={images.qr} alt="QR" className="h-20 w-20 object-contain" />}
                <div className="text-slate-600">
                  {company.bank_name && (
                    <div>
                      ธนาคาร{company.bank_name.replace(/^ธนาคาร/, "")}
                      {company.bank_branch && ` สาขา${company.bank_branch.replace(/^สาขา/, "")}`}
                    </div>
                  )}
                  {company.bank_account_name && <div>ชื่อบัญชี {company.bank_account_name}</div>}
                  {company.bank_account_no && (
                    <div className="text-[13px] font-semibold text-slate-900">เลขที่บัญชี {company.bank_account_no}</div>
                  )}
                </div>
              </div>
            </section>
          )}

          {contact.length > 0 && (
            <p className="text-slate-800">สอบถามเพิ่มเติม {contact.join(" หรือ ")}</p>
          )}
        </div>

        <div>
          <div className="space-y-1.5 text-[13px]">
            <Line k="รวมเป็นเงิน" v={`฿${money(doc.subtotal)}`} />
            {hasDiscount && (
              <>
                <Line
                  k={`ส่วนลด${doc.discount_type === "percent" ? ` (${Number(doc.discount_value)}%)` : ""}`}
                  v={`- ฿${money(doc.discount_amount)}`}
                  className="text-emerald-600"
                />
                {doc.vat_enabled && <Line k="ยอดหลังหักส่วนลด" v={`฿${money(afterDiscount)}`} className="text-slate-500" />}
              </>
            )}
            {doc.vat_enabled && <Line k={`ภาษีมูลค่าเพิ่ม ${Number(doc.vat_rate)}%`} v={`฿${money(doc.vat_amount)}`} />}
          </div>

          <div className="my-3 border-t border-slate-300" />

          <div className="flex items-baseline justify-between">
            <span className="text-[15px]">{hasWht ? "จำนวนเงินรวม" : "รวมทั้งสิ้น"}</span>
            <span className={`num font-bold ${hasWht ? "text-[16px]" : "text-[22px]"}`}>฿{money(doc.grand_total)}</span>
          </div>

          {hasWht && (
            <>
              <Line
                k={`หักภาษี ณ ที่จ่าย ${Number(doc.wht_rate)}%`}
                v={`- ฿${money(doc.wht_amount)}`}
                className="mt-1.5 text-[13px] text-rose-600"
              />
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-[15px]">{isReceipt ? "ยอดรับชำระสุทธิ" : "ยอดชำระสุทธิ"}</span>
                <span className="num text-[22px] font-bold">฿{money(doc.net_total)}</span>
              </div>
            </>
          )}

          <div className="mt-3 border-b border-slate-300 pb-3">
            <div className="text-[11px] text-slate-400">จำนวนเงิน (ตัวอักษร)</div>
            <div className="text-[13.5px] font-medium">{bahtText(doc.net_total)}</div>
          </div>
        </div>
      </div>

      {/* ---------- ลายเซ็น ---------- */}
      <div className="avoid-break mt-10 grid grid-cols-2 gap-10 text-center text-[11.5px]">
        <div className="flex flex-col justify-end">
          <div className="mx-8 border-t border-dotted border-slate-400 pt-1 text-slate-600">{LEFT_SIGN[doc.doc_type]}</div>
          <div className="text-slate-400">วันที่ ____/____/______</div>
        </div>
        <div>
          <div className="flex h-16 items-end justify-center">
            {images.signature && <img src={images.signature} alt="signature" className="max-h-16 object-contain" />}
          </div>
          <div className="mx-8 border-t border-slate-300 pt-1 font-medium">
            {company.signer_name ? company.signer_name : "ผู้มีอำนาจลงนาม"}
          </div>
          <div className="text-slate-500">{company.signer_title || "Authorized Signature"}</div>
        </div>
      </div>
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <tr>
      <td className="py-0.5 pr-6 text-slate-500">{k}</td>
      <td className="py-0.5 text-right font-semibold">{v}</td>
    </tr>
  );
}

function Party({
  title,
  name,
  address,
  taxId,
  branch,
  contact,
}: {
  title: string;
  name: string;
  address: string;
  taxId: string;
  branch: string;
  contact?: string;
}) {
  return (
    <div className={`rounded-md ${SOFT_BG} p-4`}>
      <h3 className={`mb-1 text-[14px] font-semibold ${ACCENT}`}>{title}</h3>
      <div className="font-semibold">{name}</div>
      <div className="whitespace-pre-line text-slate-600">{address}</div>
      {(taxId || branch || contact) && (
        <table className="mt-1.5">
          <tbody>
            {taxId && (
              <tr>
                <td className="pr-3 font-semibold">เลขผู้เสียภาษี</td>
                <td>{taxId}</td>
              </tr>
            )}
            {branch && (
              <tr>
                <td className="pr-3 font-semibold">สาขา</td>
                <td>{branch}</td>
              </tr>
            )}
            {contact && (
              <tr>
                <td className="pr-3 font-semibold">ติดต่อ</td>
                <td>{contact}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Line({ k, v, className = "" }: { k: string; v: string; className?: string }) {
  return (
    <div className={`flex justify-between ${className}`}>
      <span>{k}</span>
      <span className="num">{v}</span>
    </div>
  );
}
