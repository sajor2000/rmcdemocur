import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Lora, Sora } from "next/font/google";
import { Toaster } from "sonner";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  weight: ["600", "700"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

// Editorial takeaway-headline face (the "so what" leading each chart/section) —
// serif for narrative/takeaway, sans for data labels and body (R13, KTD5).
const lora = Lora({
  subsets: ["latin"],
  variable: "--font-lora",
  weight: ["500", "600"],
  style: ["normal", "italic"],
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: "RushMap AI",
  description:
    "AI-powered curriculum intelligence for Rush Medical College — aligned to AAMC standards and USMLE objectives.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${sora.variable} ${inter.variable} ${lora.variable} ${jetbrains.variable} min-h-screen flex flex-col`}
      >
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
