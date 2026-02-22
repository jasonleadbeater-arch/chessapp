import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The Treasure Chess Club",
  description: "Play chess and earn coins!",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Fallback for older browsers */}
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body>{children}</body>
    </html>
  );
}
