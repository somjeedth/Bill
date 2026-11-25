import type { NextConfig } from "next";

const chromiumBin = ["./node_modules/@sparticuz/chromium/bin/**/*"];

const nextConfig: NextConfig = {
  // Chromium สำหรับสร้าง PDF ต้องไม่ถูก bundle และต้องแนบไฟล์ binary ไปกับ function
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  outputFileTracingIncludes: {
    "/api/pdf/[id]": chromiumBin,
    "/api/pdf/[id]/route": chromiumBin,
    "/api/pdf/**/*": chromiumBin,
  },
};

export default nextConfig;
