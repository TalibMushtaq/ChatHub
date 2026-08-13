import type { Metadata } from "next";
import localFont from "next/font/local";
import { Quicksand, Nunito } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { SocketProvider } from "../components/Providers/SocketProvider";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

// Marketing fonts used by the landing page (design system: --font-display/--font-body).
const quicksand = Quicksand({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "ChatHubby — Private, real-time, personal chat",
  description:
    "ChatHubby is a private, real-time, personal place to chat. Instant delivery, honest presence, read receipts, and a little green personality.",
  icons: {
    icon: "/chathubby.webp",
    shortcut: "/chathubby.webp",
    apple: "/chathubby.webp",
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply persisted theme before first paint to avoid a flash of the wrong theme. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t){document.documentElement.setAttribute('data-theme',t);document.documentElement.classList.toggle('light',t==='light');}}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${quicksand.variable} ${nunito.variable} bg-bg text-text antialiased`}
      >
        <SocketProvider>{children}</SocketProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
