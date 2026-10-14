import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

function run(network, body) {
  execFileSync(process.execPath, ['--import', './test/register.mjs', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { localWagmiConfig } from './lib/wagmi-local.ts';
    globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    globalThis.window = { confirm: () => false };
    const connector = localWagmiConfig.connectors[0];
    ${body}
  `], { env: { ...process.env, NEXT_PUBLIC_ARC_NETWORK: network }, stdio: 'pipe' });
}

test('mainnet dev connector refuses key access and provider creation', () => {
  assert.doesNotThrow(() => run('mainnet', `
    await assert.rejects(connector.getAccounts(), /disabled on mainnet/);
    await assert.rejects(connector.getProvider(), /disabled on mainnet/);
  `));
});
test('testnet dev wallet rejects foreign-chain payment signatures', () => {
  assert.doesNotThrow(() => run('testnet', `
    const p = await connector.getProvider();
    await assert.rejects(p.request({ method: 'eth_signTypedData_v4', params: ['0x0', { domain: { chainId: 5042 }, types: {}, primaryType: 'Payment', message: {} }] }), /only for Arc testnet/);
  `));
});
test('testnet transactions and signatures require confirmation before RPC or signing', () => {
  assert.doesNotThrow(() => run('testnet', `
    const p = await connector.getProvider();
    assert.equal(await p.request({ method: 'eth_chainId' }), '0x4cef52');
    await assert.rejects(p.request({ method: 'eth_sendTransaction', params: [{ to: '0x0000000000000000000000000000000000000001' }] }), /User rejected/);
    await assert.rejects(p.request({ method: 'personal_sign', params: ['0x1234'] }), /User rejected/);
    await assert.rejects(p.request({ method: 'eth_signTypedData_v4', params: ['0x0', { domain: { chainId: 5042002 }, types: {}, primaryType: 'Payment', message: {} }] }), /User rejected/);
  `));
});
