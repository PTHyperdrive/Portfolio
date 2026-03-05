import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Notrespond.com | VPS • Email • VPN • Proxy",
  description:
    "Premium cloud infrastructure services. High-performance VPS with GPU support, secure email hosting, encrypted VPN configurations, and reliable proxy solutions.",
  keywords: ["VPS", "GPU", "VPN", "Proxy", "Email", "Cloud Server", "Infrastructure", "Be-spoke configurations"],
  authors: [{ name: "Notrespond.com" }],
  openGraph: {
    title: "Notrespond.com",
    description: "Premium cloud infrastructure and digital services",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <div className="particles-bg" aria-hidden="true" />
        <Navbar />
        <main style={{ position: "relative", zIndex: 1, minHeight: "100vh" }}>
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
