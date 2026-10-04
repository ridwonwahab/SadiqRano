import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sadiq Rano Rice | Mega Distributor",
  description:
    "Shop Rano Rice from Sadiq Rano Rice, the mega distributor in Kwanar Dawaki, Kano State.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
