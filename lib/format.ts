export const money = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const thDate = (d: string | null | undefined) => {
  if (!d) return "-";
  const dt = new Date(d + (d.length === 10 ? "T00:00:00" : ""));
  return dt.toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });
};

export const thMonth = (y: number, m: number) =>
  new Date(y, m - 1, 1).toLocaleDateString("th-TH", { year: "numeric", month: "long" });

export const thMonthShort = (m: number) =>
  new Date(2000, m - 1, 1).toLocaleDateString("th-TH", { month: "short" });

/** YYYY-MM-DD ตามเวลาเครื่อง */
export const todayISO = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const addDaysISO = (iso: string, days: number) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const DIGITS = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const PLACES = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

function readInt(s: string): string {
  // s: ตัวเลขไม่มีศูนย์นำหน้า อ่านเป็นชุดละ 6 หลัก (ล้าน)
  if (s.length > 6) {
    const head = s.slice(0, s.length - 6);
    const tail = s.slice(-6);
    const tailText = readInt(String(parseInt(tail, 10)));
    return readInt(head) + "ล้าน" + (parseInt(tail, 10) === 0 ? "" : tailText);
  }
  let out = "";
  const len = s.length;
  for (let i = 0; i < len; i++) {
    const d = parseInt(s[i], 10);
    const pos = len - i - 1;
    if (d === 0) continue;
    if (pos === 0 && d === 1 && len > 1) out += "เอ็ด";
    else if (pos === 1 && d === 2) out += "ยี่";
    else if (pos === 1 && d === 1) out += "";
    else out += DIGITS[d];
    out += PLACES[pos];
  }
  return out;
}

/** แปลงจำนวนเงินเป็นตัวอักษรไทย เช่น 1,250.50 → หนึ่งพันสองร้อยห้าสิบบาทห้าสิบสตางค์ */
export function bahtText(amount: number): string {
  const n = Math.round(Math.abs(Number(amount) || 0) * 100);
  const baht = Math.floor(n / 100);
  const satang = n % 100;
  if (baht === 0 && satang === 0) return "ศูนย์บาทถ้วน";
  let out = "";
  if (baht > 0) out += readInt(String(baht)) + "บาท";
  if (satang === 0) out += "ถ้วน";
  else out += readInt(String(satang)) + "สตางค์";
  return (amount < 0 ? "ลบ" : "") + out;
}
