import type { Metadata } from "next";
import { Geist, Geist_Mono, Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Landing page typography only — scoped via the `font-display` / `font-landing`
// utilities so the authenticated app keeps its existing Geist type.
const displayFont = Bricolage_Grotesque({
  variable: "--font-display-raw",
  subsets: ["latin"],
});

const landingSans = Plus_Jakarta_Sans({
  variable: "--font-landing-raw",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Loopin | Your AI Chief of Staff for Gmail, WhatsApp & Slack",
  description: "Loopin briefs you every morning, drafts replies in your voice, and flags what needs you — across Gmail, WhatsApp, and Slack. Confirm-before-send, always.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${displayFont.variable} ${landingSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const savedTheme = localStorage.getItem('theme') || 'dark';
                  document.documentElement.classList.add(savedTheme);
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
