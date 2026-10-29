import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KudiDesk — AI payments desk for freelancers",
  description:
    "Invoice foreign clients with PayPal, track every payment in one grid, and let AI chase what you're owed.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
