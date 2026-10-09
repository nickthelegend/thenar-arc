/** Read-only signer health requests must finish even when the service stalls. */
export async function fetchSignerHealth(origin: string, timeoutMs = 5000): Promise<{
  holdsKey?: boolean;
  verifier?: string;
  canonical?: string;
}> {
  const response = await fetch(`${origin.replace(/\/$/, "")}/api/sign`, {
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`signer returned HTTP ${response.status}`);
  return await response.json();
}
