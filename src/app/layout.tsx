import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Roboto, Roboto_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import Providers from "@/components/Providers";
import { auth } from "@/lib/auth";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto",
});

const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  variable: "--font-roboto-mono",
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Fetch session server-side so SessionProvider can pre-hydrate it.
  // This means useSession() in Navbar resolves instantly — no loading flash.
  const session = await auth();

  // Detect if this is a bare-chrome route (e.g. pop-out console window)
  const { headers } = await import("next/headers");
  const hdrs = await headers();
  const pathname = hdrs.get("x-pathname") ?? "";
  const isBare = pathname.startsWith("/console-window");

  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} ${roboto.variable} ${robotoMono.variable}`} style={{ scrollBehavior: "smooth" }}>
      <body>
        <Providers session={session}>
          {!isBare && <div className="particles-bg" aria-hidden="true" />}
          {!isBare && <Navbar />}
          <main style={{ position: "relative", zIndex: 1, minHeight: isBare ? undefined : "100vh" }}>
            {children}
          </main>
          {!isBare && <Footer />}
        </Providers>
      </body>
    </html>
  );
}
