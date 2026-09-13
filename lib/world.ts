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

/**
 * What an operator should read when World ID stops, keyed by IDKit's error code.
 *
 * The widget reports codes like `credential_unavailable`, which say what
 * happened to the software and nothing about what the person should do next.
 */
const WORLD_ERRORS: Record<string, string> = {
  user_rejected: "You cancelled the request in World App. Start again when you are ready.",
  verification_rejected: "World App declined the verification. Start again and let the Selfie Check finish.",
  credential_unavailable:
    "Your World App has no Selfie Check yet. Complete the Selfie Check in World App, then start again here.",
  feature_unavailable: "This version of World App cannot do a Selfie Check for apps. Update World App and start again.",
  world_id_4_not_available: "Your World App cannot make this kind of proof yet. Update World App and start again.",
  world_id_3_not_available: "Your World App cannot make this kind of proof yet. Update World App and start again.",
  inclusion_proof_pending: "Your World ID is still being registered. Wait a few minutes and start again.",
  inclusion_proof_failed: "World could not confirm your World ID just now. Wait a few minutes and start again.",
  max_verifications_reached:
    "This World ID has already verified a Thenar operator address. Each person can verify one address.",
  user_presence_failed: "The Selfie Check could not confirm a live person. Start again in good light, facing the camera.",
  nullifier_replayed: "That proof was already used. Start again for a fresh request.",
  duplicate_nonce: "That request was already answered. Start again for a fresh request.",
  timestamp_too_old: "The request expired before World App answered. Start again.",
  rp_signature_expired: "The request expired before World App answered. Start again.",
  invalid_timestamp: "World App rejected the request's time. Check that your phone sets its clock automatically, then start again.",
  timestamp_too_far_in_future:
    "World App rejected the request's time. Check that your phone sets its clock automatically, then start again.",
  connection_failed: "World App could not be reached. Check your phone's connection and start again.",
  unexpected_response: "World App answered with something unexpected. Start again.",
  failed_by_host_app: "The request stopped before it finished. Start again.",
  malformed_request: "Thenar's World ID request was refused as malformed. That is a fault on our side, not yours.",
  invalid_rp_signature: "Thenar's World ID request was refused: its signature did not verify. That is a fault on our side, not yours.",
  unknown_rp: "World does not recognise Thenar's World ID app. That is a fault on our side, not yours.",
  inactive_rp: "Thenar's World ID app is not active. That is a fault on our side, not yours.",
  invalid_network: "World App is on a different World ID network from this request. That is a fault on our side, not yours.",
};

export function worldErrorMessage(code: string): string {
  return (
    WORLD_ERRORS[code] ??
    `World ID stopped with "${code}". Start again, and if it happens again, send us that code.`
  );
}
