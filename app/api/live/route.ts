import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
/** Process liveness, independent of funded contract/signer readiness at /api/health. */
export async function GET() {
  return NextResponse.json({ ok: true, service: 'thenar-arc' }, { headers: { 'Cache-Control': 'no-store' } });
}
