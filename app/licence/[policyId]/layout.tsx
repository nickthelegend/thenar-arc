import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { certainlyAbsent } from "@/lib/server/exists";

// The page is a client component, which cannot export metadata, so its title lives here.
export const metadata: Metadata = { title: "Licence — Thenar" };

/**
 * 404 for a policy the contract has not minted, for the same reason as a
 * missing task: the page saying so is not the server saying so.
 */
export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ policyId: string }>;
}) {
  const { policyId } = await params;
  if (await certainlyAbsent(policyId, "policy")) notFound();
  return children;
}
