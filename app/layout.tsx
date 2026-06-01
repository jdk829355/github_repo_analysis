import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pinned Signal",
  description: "GitHub 프로필을 분석하여 프로젝트, 역할, 엔지니어링 강점을 발견하세요",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-TXM6ZGMCDF"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
    
      gtag('config', 'G-TXM6ZGMCDF');
    </script>
    <html lang="ko" className="antialiased">
      <body className="min-h-full flex flex-col bg-[#f9f9ff]">{children}</body>
    </html>
  );
}
