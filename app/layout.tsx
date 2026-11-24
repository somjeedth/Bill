import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import "./globals.css";

const thai = IBM_Plex_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-thai",
});

export const metadata: Metadata = {
  title: "ระบบบัญชี | ใบเสนอราคา ใบวางบิล ใบเสร็จ",
  description: "ออกใบเสนอราคา ใบวางบิล ใบแบ่งจ่าย ใบเสร็จรับเงิน และติดตามยอดรอชำระ",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={thai.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
