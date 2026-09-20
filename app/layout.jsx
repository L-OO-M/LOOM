import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import { ThemeProvider } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans"
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono"
});

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  style: ["normal", "italic"]
});

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: {
    default: "L.O.O.M. — Learn. Build. Prove. Connect.",
    template: "%s | L.O.O.M."
  },
  description: "L.O.O.M. is a learning operating system for college developer communities — roadmaps, real GitHub proof, contests, mentorship, and verifiable credentials, run by student departments.",
  keywords: ["developer community", "college coding club", "learn to code", "roadmaps", "hackathons", "open source", "mentorship", "programming contests"],
  authors: [{ name: "L.O.O.M." }],
  creator: "L.O.O.M.",
  verification: {
    // Set NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION after enrolling in Search Console; omitted when unset.
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
  },
  robots: { index: true, follow: true },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" }
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    siteName: "L.O.O.M.",
    title: "L.O.O.M. — Learn. Build. Prove. Connect.",
    description: "A learning operating system for college developer communities — roadmaps, real GitHub proof, contests, mentorship, verifiable credentials.",
    images: [{ url: "/loom-og.png", width: 1200, height: 630, alt: "L.O.O.M. — developer growth platform" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "L.O.O.M. — Learn. Build. Prove. Connect.",
    description: "A learning operating system for college developer communities.",
    images: ["/loom-og.png"]
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} ${display.variable}`}>
        <div aria-hidden="true" className="site-shader" />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}