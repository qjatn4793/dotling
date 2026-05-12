import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dotling — AI Pixel Art Generator",
  description: "Turn any image or text into pixel art instantly",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full flex flex-col bg-[#0f0f0f] text-[#f0f0f0]">
        {children}
      </body>
    </html>
  );
}
