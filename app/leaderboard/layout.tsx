import type { Metadata } from "next";

// The page is a client component, which cannot export metadata, so its title lives here.
export const metadata: Metadata = { title: "Operators — Thenar" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
