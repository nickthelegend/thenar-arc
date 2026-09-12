/**
 * The sentence an operator's wallet signs to claim a World ID proof.
 *
 * Shared by the station and the server so the two build it byte for byte the
 * same. Without it, anyone could request a proof for somebody else's address,
 * spend their own face on it, and lock the real owner out: the nullifier is
 * one per human, and the address would already be bound.
 */
export function bindingMessage(address: string, nonce: string): string {
  return [
    "Thenar: bind my World ID proof of a live human to this operator address.",
    `Address: ${address.toLowerCase()}`,
    `Nonce: ${nonce}`,
  ].join("\n");
}
