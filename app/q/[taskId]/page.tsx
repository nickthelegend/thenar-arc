import { redirect, notFound } from "next/navigation";

/**
 * The short way into a station from a headset: app.thenar.io/q/0 is quick to
 * type on a Quest's keyboard, and it opens the station ready to put the arm
 * on the table.
 */
export default async function QuestLink({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  if (!/^(0|[1-9]\d{0,5})$/.test(taskId)) notFound();
  redirect(`/station/${taskId}?headset=1`);
}
