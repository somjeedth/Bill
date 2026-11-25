import chromium from "@sparticuz/chromium";
import puppeteer, { type Browser } from "puppeteer-core";

/**
 * เปิดหน้า /print/[id] ด้วย Chromium แล้วพิมพ์เป็น PDF (A4)
 * - บน Vercel ใช้ @sparticuz/chromium
 * - รันในเครื่อง (npm run dev บน Mac) ให้ตั้ง CHROME_EXECUTABLE_PATH
 *   เช่น /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
 */
let browserPromise: Promise<Browser> | null = null;

async function launch(): Promise<Browser> {
  const local = process.env.CHROME_EXECUTABLE_PATH;
  return puppeteer.launch({
    executablePath: local || (await chromium.executablePath()),
    args: local ? ["--no-sandbox"] : chromium.args,
    headless: true,
    defaultViewport: { width: 1240, height: 1754 },
  });
}

async function getBrowser() {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    if (b && b.connected) return b;
  }
  browserPromise = launch();
  return browserPromise;
}

export async function renderPdf(url: string): Promise<Uint8Array> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    const res = await page.goto(url, { waitUntil: "networkidle0", timeout: 25_000 });
    if (!res || !res.ok()) throw new Error(`โหลดหน้าเอกสารไม่สำเร็จ (HTTP ${res?.status() ?? "?"})`);
    await page.emulateMediaType("print");
    // รอฟอนต์และรูป (โลโก้ ลายเซ็น ตรา QR) ให้โหลดครบ
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        Array.from(document.images)
          .filter((img) => !img.complete)
          .map((img) => new Promise((r) => { img.onload = img.onerror = r; }))
      );
    });
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    return new Uint8Array(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}
