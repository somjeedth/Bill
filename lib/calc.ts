import type { DiscountType, DocItem } from "./types";

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

export interface TotalsInput {
  items: DocItem[];
  discount_type: DiscountType;
  discount_value: number;
  vat_enabled: boolean;
  vat_rate: number;
  wht_rate: number;
}

export interface Totals {
  subtotal: number;
  discount_amount: number;
  after_discount: number;
  vat_amount: number;
  grand_total: number;
  wht_amount: number;
  net_total: number;
}

export function lineAmount(it: DocItem) {
  return round2(num(it.quantity) * num(it.unit_price));
}

/**
 * ยอดรวม = Σ(จำนวน × ราคา)
 * ส่วนลด = % ของยอดรวม หรือ จำนวนบาท
 * VAT คิดจากยอดหลังหักส่วนลด
 * หัก ณ ที่จ่าย คิดจากยอดก่อน VAT (หลังหักส่วนลด)
 * ยอดชำระสุทธิ = ยอดรวม VAT − ภาษีหัก ณ ที่จ่าย
 */
export function calcTotals(i: TotalsInput): Totals {
  const subtotal = round2(i.items.reduce((s, it) => s + lineAmount(it), 0));
  const dv = Math.max(0, num(i.discount_value));
  let discount_amount =
    i.discount_type === "percent" ? round2((subtotal * Math.min(dv, 100)) / 100) : round2(dv);
  discount_amount = Math.min(discount_amount, subtotal);
  const after_discount = round2(subtotal - discount_amount);
  const vat_amount = i.vat_enabled ? round2((after_discount * num(i.vat_rate)) / 100) : 0;
  const grand_total = round2(after_discount + vat_amount);
  const wht_amount = round2((after_discount * num(i.wht_rate)) / 100);
  const net_total = round2(grand_total - wht_amount);
  return { subtotal, discount_amount, after_discount, vat_amount, grand_total, wht_amount, net_total };
}
