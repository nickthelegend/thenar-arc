import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isAddress } from "viem";

// The page is a client component, which cannot export metadata, so its title lives here.
export const metadata: Metadata = { title: "Operator — Thenar" };

/**
 * 404 for something that is not an address. Any well-formed address is a
 * real page — one with nothing recorded is an answer, not an absence. Letter
 * case is not part of an address: a pasted one with its checksum casing
 * mangled names the same account, so it is not refused for that.
 */
export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  if (!isAddress(address, { strict: false })) notFound();
  return children;
}
