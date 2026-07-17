import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://localforge-studio.rosingh95.chatgpt.site"),
  title: "LocalForge — Shape a model around your work",
  description:
    "A private, local-first studio for planning, tuning, evaluating, and deploying language models with natural language.",
  openGraph: {
    title: "LocalForge — Your model, your machine, your rules",
    description:
      "Describe the model you need. LocalForge turns your goal into a reviewable tuning, evaluation, and deployment plan.",
    type: "website",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "LocalForge — Shape a model around your work" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "LocalForge — Shape a model around your work",
    description: "Plan, tune, evaluate, and package a local model through one guided workflow.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
