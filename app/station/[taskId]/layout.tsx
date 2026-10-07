import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { certainlyAbsent } from "@/lib/server/exists";

// The page is a client component, which cannot export metadata, so its title lives here.
export const metadata: Metadata = { title: "Station — Thenar" };

/**
 * 404 for a task the registry does not have, not a station that says so
 * under a 200: a soft 404 tells a crawler the page is real and a script that
 * the task exists.
 */
export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  if (await certainlyAbsent(taskId, "task")) notFound();
  return children;
}
