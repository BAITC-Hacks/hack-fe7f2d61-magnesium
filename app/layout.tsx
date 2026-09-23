import type { Metadata } from "next";
import "./globals.css";
import "./arena.css";

export const metadata: Metadata = {
  title: "SkillArena — Prove what you can do",
  description: "От реальных задач к доказанным навыкам и новым возможностям.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
