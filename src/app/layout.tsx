import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The Treasure Chess Club",
  description: "Play chess and earn coins!",
  icons: {
    icon: "/favicon.ico",
    apple: "/treasure_icon.png", // This makes it look like an app on iPhones
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/treasure_icon.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
