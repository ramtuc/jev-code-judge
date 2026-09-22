import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jev Code Judge",
  description: "Break the code. Find the boundary.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
