# AgentKit feedback, from integrating it into Thenar

Written during ETHOnline 2026 while putting World AgentKit in front of an x402
paywall that settles on Hedera. Everything under "Integration" happened in this
repository and can be reproduced from it; the file and line references are real.
The sections on the Developer Portal and the Sandbox App are marked where they
depend on testing with a phone that had not happened when this was written.

Versions: `@worldcoin/agentkit` 0.2.1, `@worldcoin/agentkit-core` 0.2.1,
`@x402/core` / `@x402/next` / `@x402/fetch` / `@x402/hedera` 2.25.0, Next.js 16.

## What we built with it

`GET /api/agent/corpus?taskId=N` sells one task's robot-arm trajectory corpus.
The 402 carries two offers: pay 0.5 HBAR through x402 on Hedera testnet, or
answer AgentKit's challenge. If AgentBook maps the signing wallet to a human,
the first three pulls are free (`free-trial`, `uses: 3`); otherwise the agent
pays. Route: `app/api/agent/corpus/route.ts`. Agent: `scripts/agent-buy.mjs`.

## Integration

### 1. A paid retry fails with `extension_echo_mismatch` against x402 2.25

The x402 v2 client echoes the extensions it was offered into its payment
payload, and `@x402/core` 2.25 compares that echo with what the server
advertises, field by field, unless the extension lists fields as dynamic
(`ResourceServerExtension.dynamicInfoFields`). `agentkitResourceServerExtension`
does not list any, but it mints a new `nonce`, `issuedAt` and `expirationTime`
on every 402. So the combination of "AgentKit challenge declared" and "agent
pays" always failed: the client echoed the nonce from the first 402 and the
server compared it with the nonce it had just generated for the retry.

What we did (`app/api/agent/corpus/route.ts`):

```ts
const agentkitExtension = {
  ...agentkitResourceServerExtension,
  dynamicInfoFields: ["nonce", "issuedAt", "expirationTime"],
};
```

Suggestion: declare those three in the extension itself. It took reading
`@x402/core`'s compiled server to find the cause; the error names the
extension key but not the field.

### 2. The client reads the offer from the body; x402 v2 sends it in a header

`createAgentkitClient().fetch` looks for the challenge at
`(await response.json()).extensions.agentkit`. An x402 v2 resource server puts
the PaymentRequired object in the `PAYMENT-REQUIRED` header and, for non-browser
clients, answers with a body of `{}` unless the route supplies
`unpaidResponseBody` — which is not given the enriched PaymentRequired, so it
cannot easily return it. Against a stock `withX402` route the client never sees
the challenge and silently falls through to paying.

What we did: the route decodes `PAYMENT-REQUIRED` and returns the same object as
the JSON body of the 402. Suggestion: have the client fall back to
`decodePaymentRequiredHeader` when the body has no `extensions`.

### 3. `createAgentBookVerifier` is not exported from `@worldcoin/agentkit`

The server needs it for `createAgentkitHooks({ agentBook })`, but it is exported
only from `@worldcoin/agentkit-core`, which then has to become a direct
dependency. `parseAgentkitHeader` is in the same place. Re-exporting both from
`@worldcoin/agentkit` would make the server snippet work as written.

### 4. Free trials need storage, and only an in-memory one ships

`free-trial` and `discount` throw without `storage`, which is right. The only
implementation provided is `InMemoryAgentKitStorage`, which resets on every
restart — on most hosts, every deploy — so a "3 free pulls" trial is not
limited in practice. The `tryIncrementUsage` doc comment asking for an atomic
check-and-increment was exactly the right warning. We implemented it as one
statement that works on both SQLite and Postgres (`lib/server/agent-sales.ts`):

```sql
INSERT INTO agentkit_usage (endpoint, human_id, uses) VALUES (?, ?, 1)
ON CONFLICT (endpoint, human_id) DO UPDATE SET uses = agentkit_usage.uses + 1
WHERE agentkit_usage.uses < ?
RETURNING uses
```

A reference SQL storage in the docs would save most integrators from shipping
the in-memory one to production.

### 5. What the usage counter is keyed on is not documented

`requestHook` counts uses under `context.path`, which is the pathname without
the query string. For us that is the right behaviour (three free pulls across
all tasks, not three per task), but we learned it from the compiled source.

### 6. Where an agent must be registered for the verifier to see it

`createAgentBookVerifier`'s doc comment says it always resolves against the
AgentBook deployment on World Chain. Material we read while setting up also
shows the registration CLI with a network option. It was not clear to us whether
an agent registered on another network is visible to the default verifier; a
sentence in the docs would settle it.

### 7. Things that worked well

- `onEvent` on both client and hooks. `agent_not_verified` made the paid
  fallback visible in logs instead of looking like a failure.
- `lookupHuman` against World Chain answered in about 400 ms from a laptop.
- An agent with no human behind it is not refused, just not favoured. That
  default made AgentKit easy to add in front of something that already charged.

## Selfie Check — integration notes, not yet proven end to end

A second World integration was started in the same repository: gating the route
that records a contribution behind a World ID Selfie Check. It is blocked on the
relying-party signing key, so no proof has been verified end to end yet. This is
what was learned getting that far, with IDKit 4.2.x.

- **`rp_context` needs a key the portal shows once.** Every IDKit 4.2 request
  requires `rp_context`, which comes from
  `signRequest({ signingKeyHex, action, ttl })` in `@worldcoin/idkit-core/signing`.
  The Developer Portal displays that signing key exactly once. This app's key was
  not on the machine doing the integration, and the portal gave no sign that a key
  existed or when it was last rotated. The docs do not say up front that a lost
  key means rotating it. The flow stops there until the key is retrieved or
  rotated.
- **The precheck cannot tell you whether an action exists.**
  `POST developer.world.org/api/v1/precheck/{app_id}` with `{ action }` was the only
  way found to see `enable_face_check` before writing code. It returned `true` both
  for a registered action and for one that had never been created.
- **`/api/v4/verify/{rp_id}` checks the proof and nothing around it.** It does not
  confirm that your server issued the nonce, and it does not check the signal.
  Thenar keeps its own nonces (a `world_nonce` table) and compares
  `responses[0].signal_hash` with `hashSignal(address)`. That helper is in
  `@worldcoin/idkit-core/hashing`, which the integration page does not mention.
- **Selfie Check is a preview behind a legacy flag.** It is
  `selfieCheckLegacy({ signal })` with `allow_legacy_proofs: true`, v3 proofs
  only, and its type comment says to contact World to have it enabled.
- **The IDKit type declarations were the most reliable reference.**
  `docs.world.org/llms.txt` timed out twice.
- **A proof alone should not bind an address.** The nullifier is one per human
  per action, so anyone could spend their own face on someone else's address and
  lock the real owner out. Thenar also requires a wallet signature over the nonce
  before it binds a human to an address. The docs should warn about this.

## Developer Portal navigation

Not yet exercised at the time of writing. To be completed by the person who
registers the agent: where they started, what they looked for and how long it
took to find, anything that required guessing.

## Sandbox App states

Not yet exercised at the time of writing. The agent wallet to register is
`0x9a6C46E7115CfB5FF5a2265E5a1B955038cb63aA`. To be completed after
registering it: which states the Sandbox App showed, whether the registration
was visible to `GET /api/agent/status?address=…` straight away, and whether the
next `node scripts/agent-buy.mjs` run was granted a free pull.

## Confusing or missing

- The three integration issues above (1–3) each cost more time than the rest of
  the integration together, and all three are at the seam with x402 v2.
- No end-to-end example of AgentKit in front of a Next.js App Router route using
  `withX402` / `withX402FromHTTPServer`.
