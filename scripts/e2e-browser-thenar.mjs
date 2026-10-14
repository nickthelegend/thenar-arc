/** Lead-run browser proof. No RPC mocking or injected trajectories.
 * npm run e2e:browser:thenar                 read-only route audit
 * npm run e2e:browser:thenar -- --flow       real browser transactions, <=1 test USDC
 * npm run e2e:browser:thenar -- --sweep      recover saved throwaway balances
 * BASE=https://... uses a hosted deployment; otherwise starts/stops port 9011.
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, chmodSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { createPublicClient, createWalletClient, http, erc20Abi, parseEventLogs, formatUnits } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { PRODUCTS } from '../lib/products.ts';
import { AXON_ABI } from '../lib/abi.ts';
import { SALES_LOG_ABI } from '../lib/registry-abi.ts';
import { readEnvFile, arcTestnet } from './arc.mjs';

const BASE = process.env.BASE || 'http://localhost:9011';
const flow = process.argv.includes('--flow');
const sweepOnly = process.argv.includes('--sweep');
const out = 'docs/screens/testnet/round-2';
const keysFile = '.data/browser-round2-wallets.json';
const reportFile = `${out}/results-${sweepOnly ? 'sweep' : flow ? 'flow' : 'screens'}.json`;
const deployment = JSON.parse(readFileSync('deployments/arc-testnet.json', 'utf8'));
const protocol = deployment.contracts.protocol;
const usdc = '0x3600000000000000000000000000000000000000';
const deployer = '0x0648aDF1967692A0c991d7715b0b588452321FBd';
const rpc = createPublicClient({ chain: arcTestnet, transport: http('https://rpc.testnet.arc.io'), pollingInterval: 1000 });
const wallet = key => createWalletClient({ account: privateKeyToAccount(key), chain: arcTestnet, transport: http('https://rpc.testnet.arc.io') });
const results = [];
let server, browser, taskId;
const contexts = [];
let keyring = {};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const safe = e => String(e?.message ?? e).replace(/0x[0-9a-fA-F]{64}/g, '[hash redacted]').slice(0, 600);
function result(step, ok, detail = '') {
  results.push({ step, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${step}${detail ? ` · ${detail}` : ''}`);
}
async function check(step, fn) {
  try { await fn(); result(step, true); }
  catch (e) { result(step, false, safe(e)); throw e; }
}
async function receipt(hash, label) {
  const r = await rpc.waitForTransactionReceipt({ hash, timeout: 120_000 });
  assert.equal(r.status, 'success');
  result(label, true, `https://explorer.testnet.arc.io/tx/${hash}`);
  return r;
}
const balance = address => rpc.readContract({ address: usdc, abi: erc20Abi, functionName: 'balanceOf', args: [address] });
const getTask = () => rpc.readContract({ address: protocol, abi: AXON_ABI, functionName: 'getTask', args: [BigInt(taskId)] });
async function lock(fn) {
  const path = '../.deployer/lock';
  const deadline = Date.now() + 120_000;
  while (true) {
    try { mkdirSync(path); break; }
    catch (e) { if (e.code !== 'EEXIST' || Date.now() > deadline) throw new Error('Shared deployer lock unavailable'); await sleep(1000); }
  }
  try { return await fn(); }
  finally { const { rmdirSync } = await import('node:fs'); rmdirSync(path); }
}
async function sweep() {
  for (const [role, key] of Object.entries(keyring)) {
    try {
      const w = wallet(key);
      const held = await rpc.getBalance({ address: w.account.address });
      const gasPrice = await rpc.getGasPrice();
      const gas = await rpc.estimateGas({ account: w.account, to: deployer, value: 1n });
      const reserve = gas * gasPrice * 120n / 100n;
      if (held <= reserve) { result(`sweep ${role}`, true, `dust ${formatUnits(held, 18)} test USDC; key saved`); continue; }
      await receipt(await w.sendTransaction({ to: deployer, value: held - reserve, gas, gasPrice, type: 'legacy' }), `sweep ${role}`);
    } catch (e) { result(`sweep ${role}`, false, `${safe(e)}; retry with --sweep`); }
  }
}
async function startServer() {
  if (process.env.BASE) return;
  try { await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1500) }); throw new Error('Port 9011 is occupied. Set BASE explicitly to reuse a known testnet server.'); }
  catch (e) { if (String(e.message).includes('occupied')) throw e; }
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', '9011'], { stdio: ['ignore', 'ignore', 'ignore'], env: { ...process.env, NEXT_PUBLIC_ARC_NETWORK: 'testnet' } });
  result('start owned production server', true, `PID ${server.pid}, port 9011`);
  for (let i = 0; i < 90; i++) {
    if (server.exitCode !== null) throw new Error('Production server exited; run npm run build first');
    try { const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(4000) }); if (r.status < 500) return; } catch { /* starting */ }
    await sleep(1000);
  }
  throw new Error('Server health did not become ready');
}
async function newPage(role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  contexts.push(context);
  await context.addCookies([{ name: 'thenar-dev-wallet', value: '1', url: BASE, sameSite: 'Strict' }]);
  if (role) await context.addInitScript(({ key, origin }) => {
    if (location.origin === origin) localStorage.setItem('thenar:testnet:dev-key', key);
  }, { key: keyring[role], origin: new URL(BASE).origin });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  page.on('dialog', d => d.accept());
  if (role) {
    await page.goto(`${BASE}/dev-wallet`);
    await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
    await page.getByTestId('wallet-address').waitFor();
    assert.equal((await page.getByTestId('wallet-address').innerText()).toLowerCase(), wallet(keyring[role]).account.address.toLowerCase());
  }
  return page;
}
function routes() {
  const pages = [];
  function visit(dir) {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (ent.isDirectory()) visit(`${dir}/${ent.name}`);
      else if (ent.name === 'page.tsx') pages.push(dir.replace(/^app/, '') || '/');
    }
  }
  visit('app');
  const proof = '0x842bcb0fe0cf501035104614264a793836dc4d376c44f207642169bec538e99b';
  const mappings = { '[taskId]': '0', '[id]': '0', '[policyId]': '0', '[address]': deployer, '[hash]': proof };
  return [...new Set(pages.map(path => {
    if (path === '/products/[id]') return '/products/thenar';
    if (path === '/explorer/tx/[hash]') return '/explorer/tx/0xa5214ce03c81b1fd91a799ae90beeb0de756e641691b9ae3999e5cc5fe0c95ed';
    return path.replace(/\[[^\]]+\]/g, token => mappings[token]);
  })), ...PRODUCTS.map(p => `/products/${p.id}`), '/missing-round2-route'];
}
async function audit() {
  const page = await newPage();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const route of routes()) {
      const errors = [];
      const onError = e => errors.push(safe(e));
      const onConsole = msg => { if (msg.type() === 'error' && !/404|402/.test(msg.text())) errors.push(safe(msg.text())); };
      const onResponse = response => {
        if (response.status() >= 400 && !response.request().isNavigationRequest() && response.status() !== 402) errors.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`);
      };
      const onFailed = request => {
        if (!/ERR_ABORTED/.test(request.failure()?.errorText ?? '')) errors.push(`request failed: ${new URL(request.url()).pathname}`);
      };
      page.on('pageerror', onError); page.on('console', onConsole); page.on('response', onResponse); page.on('requestfailed', onFailed);
      try {
        const response = await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
        await page.locator('main').waitFor();
        await page.waitForTimeout(1500);
        const state = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          brokenImages: [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.getAttribute('src')),
          badLinks: [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).filter(h => /^https?:/.test(h) && /(?:arcscan|explorer\.arc\.io|monad)/i.test(h)),
          text: document.querySelector('main')?.innerText ?? '',
        }));
        await page.screenshot({ path: `${out}/${width}-${route === '/' ? 'home' : route.replace(/[^a-z0-9]+/gi, '-')}.png`, fullPage: true });
        const missing = route === '/missing-round2-route' || route.startsWith('/explorer/');
        assert.ok(missing ? [200, 404].includes(response.status()) : response.status() === 200, `HTTP ${response.status()}`);
        assert.equal(state.overflow, false, 'horizontal overflow');
        assert.deepEqual(state.brokenImages, [], 'broken images');
        assert.deepEqual(state.badLinks, [], 'wrong explorer/network links');
        assert.ok(!/\b(?:Monad|AUSD|lorem ipsum|NaN|undefined)\b/i.test(state.text), 'stale or invalid visible copy');
        assert.deepEqual(errors, [], 'browser errors');
        result(`screen ${width} ${route}`, true);
      } catch (e) { result(`screen ${width} ${route}`, false, safe(e)); }
      finally { page.off('pageerror', onError); page.off('console', onConsole); page.off('response', onResponse); page.off('requestfailed', onFailed); }
    }
  }
  await page.context().close();
}
async function coreFlow() {
  if (existsSync(keysFile)) throw new Error('Saved round-2 wallets exist. Run --sweep, then archive that gitignored file before a new funded flow.');
  keyring = Object.fromEntries(['sponsor', 'operator', 'buyer'].map(role => [role, generatePrivateKey()]));
  writeFileSync(keysFile, JSON.stringify(keyring), { mode: 0o600, flag: 'wx' });
  chmodSync(keysFile, 0o600);
  const key = readEnvFile('../.deployer/deployer.env').DEPLOYER_PRIVATE_KEY;
  const funder = wallet(key);
  assert.equal(funder.account.address.toLowerCase(), deployer.toLowerCase());
  // 0.63 USDC sent, including all browser gas and escrow. Leave >0.3 budget for
  // funding gas and the existing issuer/facilitator's admission/share/sale gas.
  await lock(async () => {
    for (const [role, amount] of [['sponsor', 400000n], ['operator', 200000n], ['buyer', 30000n]]) {
      await receipt(await funder.writeContract({ address: usdc, abi: erc20Abi, functionName: 'transfer', args: [wallet(keyring[role]).account.address, amount], gas: 100000n, maxFeePerGas: 30_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n }), `fund ${role}`);
    }
  });
  const sponsor = await newPage('sponsor');
  await check('sponsor discovers and creates funded task through browser', async () => {
    await sponsor.goto(`${BASE}/hub`);
    await sponsor.getByRole('link', { name: 'Create a task · sponsor operators' }).click();
    await sponsor.getByRole('radio', { name: /THENAR-6/ }).click();
    await sponsor.getByLabel('Slots', { exact: false }).fill('1');
    await sponsor.getByLabel('Reward per run', { exact: false }).fill('0.05');
    await sponsor.getByRole('button', { name: 'Approve, escrow and post', exact: true }).click();
    const created = sponsor.getByTestId('task-created');
    await created.waitFor({ timeout: 120_000 });
    taskId = Number(await created.getAttribute('data-task-id'));
    writeFileSync('.data/browser-round2-task.json', JSON.stringify({ taskId }));
    const t = await getTask(); assert.equal(t.escrow, 50000n); assert.equal(Number(t.slotsTotal), 1);
    const href = await sponsor.locator('a[href^="https://explorer.testnet.arc.io/tx/"]').last().getAttribute('href');
    await receipt(href.split('/').at(-1), 'browser sponsor createTask');
  });
  const operator = await newPage('operator');
  const cdp = await operator.context().newCDPSession(operator);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await check('browser WebAuthn registration and on-chain operator admission', async () => {
    await operator.goto(`${BASE}/passkey`);
    await operator.getByRole('button', { name: 'Set up your passkey', exact: true }).click();
    await operator.getByText('Passkey registered · you can earn', { exact: true }).waitFor({ timeout: 120_000 });
    const admitted = await operator.locator('a').filter({ hasText: 'See it on Arc' }).getAttribute('href');
    if (admitted) await receipt(admitted.split('/').at(-1), 'browser operator admission');
  });
  let accepted, pay;
  await check('keyboard-operated browser run pays operator from sponsor escrow', async () => {
    await operator.goto(`${BASE}/station/${taskId}`);
    await operator.getByRole('button', { name: 'Begin run', exact: true }).click();
    const telemetry = operator.getByTestId('station-telemetry');
    await telemetry.waitFor();
    const point = async () => (await telemetry.getAttribute('data-tool')).split(',').map(Number);
    async function move(target) {
      for (let i = 0; i < 150; i++) {
        const current = await point();
        const delta = target.map((v, j) => v - current[j]);
        const axis = delta.reduce((best, v, j) => Math.abs(v) > Math.abs(delta[best]) ? j : best, 0);
        if (Math.abs(delta[axis]) < 0.008) return;
        const key = [['s', 'w'], ['d', 'a'], ['q', 'e']][axis][delta[axis] > 0 ? 1 : 0];
        await operator.keyboard.down(key);
        await operator.waitForTimeout(Math.max(16, Math.min(100, Math.abs(delta[axis]) / 0.42 * 750)));
        await operator.keyboard.up(key);
        await operator.waitForTimeout(100);
      }
      throw new Error('Keyboard controls did not reach target within 8mm');
    }
    await move([0.22, 0.14, 0.06]);
    await operator.keyboard.press('Space');
    await operator.waitForFunction(() => document.querySelector('[data-testid="station-telemetry"]')?.getAttribute('data-held') === 'true');
    await move([0.22, 0.14, 0.15]);
    await move([0.16, -0.18, 0.15]);
    await move([0.16, -0.18, 0.04]);
    await operator.keyboard.press('Space');
    await operator.getByRole('button', { name: 'Submit and get paid', exact: true }).waitFor();
    const before = await balance(wallet(keyring.operator).account.address);
    const recordedPromise = operator.waitForResponse(r => r.url().endsWith('/api/submitted') && r.request().method() === 'POST', { timeout: 120_000 });
    recordedPromise.catch(() => {}); // Preserve cleanup if an earlier UI step fails.
    await operator.getByRole('button', { name: 'Submit and get paid', exact: true }).click();
    const payout = operator.getByTestId('payout-explorer'); await payout.waitFor({ timeout: 120_000 });
    pay = await receipt((await payout.getAttribute('href')).split('/').at(-1), 'browser operator payout');
    accepted = parseEventLogs({ abi: AXON_ABI, logs: pay.logs, eventName: 'TrajectoryAccepted' })[0].args;
    assert.equal(accepted.contributor.toLowerCase(), wallet(keyring.operator).account.address.toLowerCase());
    assert.ok(accepted.paid > 0n);
    assert.equal((await getTask()).escrow, 50000n - accepted.paid);
    const after = await balance(wallet(keyring.operator).account.address);
    const gasUnits = (pay.gasUsed * pay.effectiveGasPrice + 999999999999n) / 1000000000000n;
    assert.ok(after >= before + accepted.paid - gasUnits - 1n, 'net operator balance accounts for gas');
    assert.match(await operator.getByTestId('run-reward').innerText(), /Paid to your wallet/);
    await operator.screenshot({ path: `${out}/flow-payout.png`, fullPage: true });
    await operator.setViewportSize({ width: 390, height: 844 });
    await operator.getByTestId('payout-explorer').scrollIntoViewIfNeeded();
    await operator.screenshot({ path: `${out}/flow-payout-mobile.png`, fullPage: true });
    await operator.getByTestId('buy-run-data').waitFor();
    const recorded = await recordedPromise;
    assert.ok(recorded.ok(), 'run stored after payout');
    const recordedBody = await recorded.json();
    assert.equal(recordedBody.shares?.issued, true, 'corpus shares issued');
    await receipt(recordedBody.shares.tx, 'browser corpus shares');
  });
  const buyer = await newPage('buyer');
  await check('browser buyer pays x402 and receives the run with an on-chain hash', async () => {
    const before = await balance(wallet(keyring.buyer).account.address);
    await buyer.goto(`${BASE}/corpus?task=${taskId}`);
    const responsePromise = buyer.waitForResponse(r => r.url().includes(`/api/agent/corpus?taskId=${taskId}`) && r.status() === 200, { timeout: 120_000 });
    const downloadPromise = buyer.waitForEvent('download', { timeout: 120_000 });
    responsePromise.catch(() => {}); downloadPromise.catch(() => {});
    await buyer.getByRole('button', { name: new RegExp(`Buy task #${taskId} for`) }).click();
    const [response, download] = await Promise.all([responsePromise, downloadPromise]);
    const bytes = await response.body();
    assert.ok(bytes.toString().includes(accepted.trajHash), 'bought corpus includes paid run');
    const hash = createHash('sha256').update(bytes).digest('hex');
    assert.equal(response.headers()['x-thenar-sha256'], hash);
    const log = response.headers()['x-thenar-audit']; assert.match(log, /^0x[0-9a-fA-F]{40}#\d+$/);
    const sale = await rpc.readContract({ address: deployment.contracts.salesLog, abi: SALES_LOG_ABI, functionName: 'getSale', args: [BigInt(log.split('#')[1])] });
    assert.equal(sale.sha256.toLowerCase(), `0x${hash}`);
    assert.equal(Number(sale.taskId), taskId);
    assert.equal(before - await balance(wallet(keyring.buyer).account.address), 10000n);
    await download.saveAs(`${out}/purchased-task-${taskId}.json`);
    const explorer = buyer.getByTestId('purchase-explorer'); await explorer.waitFor();
    await receipt((await explorer.getAttribute('href')).split('/').at(-1), 'browser x402 settlement');
    await buyer.screenshot({ path: `${out}/flow-purchase.png`, fullPage: true });
  });
  await check('sponsor reclaims scoring remainder through browser', async () => {
    await sponsor.goto(`${BASE}/task/${taskId}`);
    const t = await getTask();
    if (t.escrow > 0n) {
      await sponsor.getByRole('button', { name: /Close and reclaim/ }).click();
      await sponsor.getByText('closed — the escrow went back to the funder', { exact: true }).waitFor({ timeout: 120_000 });
      assert.equal((await getTask()).escrow, 0n);
      await receipt((await sponsor.getByTestId('refund-explorer').getAttribute('href')).split('/').at(-1), 'browser sponsor refund');
    }
  });
}

mkdirSync(out, { recursive: true }); mkdirSync('.data', { recursive: true });
try {
  assert.equal(await rpc.getChainId(), 5042002);
  if (sweepOnly) {
    keyring = JSON.parse(readFileSync(keysFile, 'utf8'));
    await sweep();
  } else {
    await startServer();
    const arc = await fetch(`${BASE}/api/arc`).then(r => r.json());
    assert.equal(arc.chainId, 5042002); assert.equal(arc.contracts.protocol.toLowerCase(), protocol.toLowerCase());
    assert.ok(!/fork/i.test(arc.network ?? arc.name ?? ''), 'public testnet only');
    browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    if (flow) await coreFlow(); else await audit();
  }
} catch (e) { result('suite', false, safe(e)); }
finally {
  if (flow && Object.keys(keyring).length) await sweep();
  await browser?.close();
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await Promise.race([new Promise(resolve => server.once('exit', resolve)), sleep(5000)]);
    if (server.exitCode === null) { server.kill('SIGKILL'); result('server cleanup', false, `Check PID ${server.pid}`); }
    else result('stopped owned server', true, `PID ${server.pid}`);
  }
  writeFileSync(reportFile, JSON.stringify({ at: new Date().toISOString(), base: BASE, mode: sweepOnly ? 'sweep' : flow ? 'flow' : 'screens', taskId, results }, null, 2));
  process.exitCode = results.some(r => !r.ok) ? 1 : 0;
}
