import "./globals.css";

export const metadata = {
  title: "ChatHub",
  description: "A clean Next.js layout",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-neutral-900 text-white">{children}</body>
    </html>
  );
}
