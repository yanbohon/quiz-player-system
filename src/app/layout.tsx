import type { Metadata, Viewport } from "next";
import { Providers } from "@/app/providers";
import { FlexibleLayout } from "@/lib/flexible";
import "./globals.css";

export const metadata: Metadata = {
  title: "答题系统 - 选手端",
  description: "答题系统选手端应用",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,  // 允许放大到 5 倍，方便用户调整
  minimumScale: 0.5, // 允许缩小到 0.5 倍
  userScalable: false, // 允许用户手动缩放
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <FlexibleLayout />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

