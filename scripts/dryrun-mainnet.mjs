import * as c from './dryrun-common.mjs';
await c.run('thenar', async () => {
const n='thenar',d=c.load(n),a=(await import('../lib/abi.ts')).AXON_ABI;
c.roleKey('verifier','thenar','VERIFIER_PRIVATE_KEY',d.verifier);
process.env.VERIFIER_PRIVATE_KEY=c.keys.verifier;
for(const role of ['buyer','buyer2','relayer'])await c.fund(n,role);
const task=await c.read(d.contracts.protocol,a,'taskCount');
await c.approve(n,'buyer',d.contracts.protocol,100000n);
await c.write(n,'create task with 0.05 USDC escrow','buyer',d.contracts.protocol,a,'createTask',['Dry-sign recorded trajectory',1,50000n,0,0,50000n]);
await c.write(n,'fund task additional 0.05 USDC','buyer',d.contracts.protocol,a,'fundTask',[task,50000n]);
const {makeRun}=await import('./recorded-run.mjs');
const {verifyAndSign}=await import('../lib/server/verifier.ts');
const {run}=makeRun(314);
const v=await verifyAndSign({taskId:Number(task),contributor:c.roles.buyer2,...run,parSeconds:120,rewardWei:50000n,contractAddress:d.contracts.protocol,chainId:5042});
if(!v.accepted)throw Error('Real recorded trajectory rejected by verifier');
await c.write(n,'submitTrajectoryFor verifier-signed','relayer',d.contracts.protocol,a,'submitTrajectoryFor',[c.roles.buyer2,task,v.trajHash,v.cid,v.score,v.signature]);
const u=await c.auth('buyer',d.treasury,10000n);
await c.write(n,'x402 corpus purchase EIP-3009','relayer',c.USDC,c.erc,'transferWithAuthorization',[u.from,u.to,u.value,u.validAfter,u.validBefore,u.nonce,u.v,u.r,u.s]);
c.note('verifier',{address:d.verifier,accepted:v.accepted,score:v.score,task});

});
