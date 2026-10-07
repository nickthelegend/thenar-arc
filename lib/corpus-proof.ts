/**
 * What a subscriber signs to download a whole task's corpus.
 *
 * The subscription is on chain under an address, and the address is public:
 * every Subscribed event names it. Asking only for the address in a header
 * let anyone who read the chain download as any subscriber. So the download
 * carries a signature from that address over this message, good for a few
 * minutes and for one task.
 */
export const PROOF_WINDOW_SECONDS = 600;

export function corpusDownloadMessage(subscriber: string, taskId: number, until: number): string {
  return `Thenar corpus download\nsubscriber: ${subscriber.toLowerCase()}\ntask: ${taskId}\nuntil: ${until}`;
}
