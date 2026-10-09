import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readonlyWagmiConfig } from '../lib/wagmi-readonly.ts';
import { appChain } from '../lib/chain.ts';

test('missing sign-in uses a connector-free config on the selected Arc chain', () => {
  assert.equal(readonlyWagmiConfig.chains[0].id, appChain.id);
  assert.deepEqual(readonlyWagmiConfig.connectors, []);
  assert.equal(readonlyWagmiConfig.storage, null);
  assert.equal(readonlyWagmiConfig.state.status, 'disconnected');
  assert.equal(readonlyWagmiConfig.state.connections.size, 0);
});


test('read-only hydration neither crashes nor reconnects a wallet', async () => {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const fromWagmi = createRequire(require.resolve('wagmi'));
  const { hydrate } = await import(fromWagmi.resolve('@wagmi/core'));
  await assert.doesNotReject(hydrate(readonlyWagmiConfig, { reconnectOnMount: false }).onMount());
  assert.deepEqual(readonlyWagmiConfig.connectors, []);
  assert.equal(readonlyWagmiConfig.state.status, 'disconnected');
});
