import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 设计自助生产平台",
  description:
    "面向美团外卖创意营销场景，用自然语言自助生成会场头图、会场组件与多尺寸资源位延展。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="text-ink-body min-h-full font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
