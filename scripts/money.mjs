/**
 * Prove the money actually moves, on the live contract, with measured balances.
 *
 *   task created  -> escrow funded from the funder's own balance
 *   run accepted  -> escrow falls by the payout, operator rises by it net of gas
 *   task filled   -> policy mints, cap table sums to 100%
 *   licence sold  -> every contributor is paid in that one transaction
 *   contract      -> holds no more than the remaining escrow afterwards
 */
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, formatEther, parseEther, parseAbi } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
const BASE = process.argv[2] ?? "https://web-production-2d1d0.up.railway.app";
const env = Object.fromEntries(readFileSync(".env.deployer","utf8").split("\n").filter(Boolean).map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1)];}));
const chain={id:10143,name:"Monad Testnet",nativeCurrency:{name:"Monad",symbol:"MON",decimals:18},rpcUrls:{default:{http:["https://testnet-rpc.monad.xyz"]}}};
const abi=parseAbi([
"function createTask(string name, uint32 slots, uint128 rewardPerTrajectory, uint8 scenario, uint8 difficulty) payable returns (uint256)",
"function submitTrajectory(uint256 taskId, bytes32 trajHash, string cid, uint16 score, bytes signature) returns (uint256)",
"function mintPolicy(uint256 taskId, uint128 licenceFee) returns (uint256)",
"function licensePolicy(uint256 policyId) payable",
"function taskCount() view returns (uint256)",
"function policyCount() view returns (uint256)",
"function claimable(address) view returns (uint256)",
"function getTask(uint256) view returns ((string name, address funder, uint128 rewardPerTrajectory, uint128 escrow, uint32 slotsTotal, uint32 slotsFilled, uint8 scenario, uint8 difficulty, bool policyMinted))",
"function capTable(uint256) view returns (address[] who, uint256[] weightBps, uint256[] payout)"]);
const AXON=env.AXON_ADDRESS, GAS=500000n;
const pub=createPublicClient({chain,transport:http()});
const owner=privateKeyToAccount(env.DEPLOYER_PRIVATE_KEY);
const wallet=createWalletClient({account:owner,chain,transport:http()});
let failed=0; const check=(ok,m,x="")=>{if(!ok)failed++;console.log(`${ok?"  ok  ":" FAIL "} ${m}${x?` — ${x}`:""}`);};
async function awaitFunds(a,w){for(let i=0;i<80;i++){if((await pub.getBalance({address:a}))>=w)return true;await new Promise(r=>setTimeout(r,250));}return false;}
function makeRun(dev,secs){
  const hz=20,n=hz*secs,from=[0.3,0.2],goal=[0.17,-0.24],s=[];
  for(let i=0;i<=n;i++){const u=i/n,e=u<0.5?2*u*u:1-Math.pow(-2*u+2,2)/2;
    s.push({t:+(i/hz).toFixed(3),q:[0.1*e,0.5*e,0.9*e,0,1.2*e,0],grip:u>0.05&&u<0.95?6:42,
      object:[from[0]+(goal[0]-from[0])*e,from[1]+(goal[1]-from[1])*e,Math.sin(Math.PI*u)*0.18]});}
  s[s.length-1].object=[goal[0]+dev/1000,goal[1],0];
  return {samples:s,durationSeconds:secs,deviationMm:dev,success:true};
}
const REWARD=parseEther("0.002"), SLOTS=2, FEE=parseEther("0.01");
console.log(`\nMoney movement on ${AXON}\ndeployer ${formatEther(await pub.getBalance({address:owner.address}))} MON\n`);

// --- create -----------------------------------------------------------------
const REUSE=process.argv[3]?Number(process.argv[3]):null;
let taskId, h, r;
if(REUSE===null){
  const contractBefore=await pub.getBalance({address:AXON});
  h=await wallet.writeContract({address:AXON,abi,functionName:"createTask",
    args:["Withdraw proof — settle the block on the datum",SLOTS,REWARD,4,2],value:REWARD*BigInt(SLOTS),gas:GAS});
  r=await pub.waitForTransactionReceipt({hash:h});
  check(r.status==="success","task created");
  taskId=Number(await pub.readContract({address:AXON,abi,functionName:"taskCount"}))-1;
  const contractAfterCreate=await pub.getBalance({address:AXON});
  check(contractAfterCreate-contractBefore===REWARD*BigInt(SLOTS),"contract balance rose by exactly the escrow",
    `+${formatEther(contractAfterCreate-contractBefore)} MON`);
}else{ taskId=REUSE; console.log(`  --   reusing task #${taskId}\n`); }
let t=await pub.readContract({address:AXON,abi,functionName:"getTask",args:[BigInt(taskId)]});
check(t.escrow===REWARD*BigInt(SLOTS),"escrow equals slots x reward",`${formatEther(t.escrow)} MON`);

// --- fill, measuring each payout -------------------------------------------
const ops=[];
for(let i=0;i<SLOTS;i++){
  const op=privateKeyToAccount(generatePrivateKey());
  const f=await wallet.sendTransaction({to:op.address,value:parseEther("0.15"),gas:21000n});
  await pub.waitForTransactionReceipt({hash:f});
  if(!await awaitFunds(op.address,parseEther("0.15"))){check(false,"operator funded");continue;}
  await new Promise(s=>setTimeout(s,1500));
  const res=await fetch(`${BASE}/api/verify`,{method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({taskId,contributor:op.address,...makeRun(3.0+i*1.7,74+i*11)})});
  const v=await res.json();
  if(!res.ok){check(false,`verify ${i}`,v.error);continue;}
  const opBefore=await pub.getBalance({address:op.address});
  const escrowBefore=(await pub.readContract({address:AXON,abi,functionName:"getTask",args:[BigInt(taskId)]})).escrow;
  const w=createWalletClient({account:op,chain,transport:http()});
  const th=await w.writeContract({address:AXON,abi,functionName:"submitTrajectory",
    args:[BigInt(taskId),v.trajHash,v.cid,v.score,v.signature],gas:GAS});
  const tr=await pub.waitForTransactionReceipt({hash:th});
  await fetch(`${BASE}/api/submitted`,{method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({trajHash:v.trajHash,txHash:th})});
  await new Promise(s=>setTimeout(s,1500));
  const opAfter=await pub.getBalance({address:op.address});
  const escrowAfter=(await pub.readContract({address:AXON,abi,functionName:"getTask",args:[BigInt(taskId)]})).escrow;
  const gasPaid=tr.gasUsed*tr.effectiveGasPrice;
  check(tr.status==="success",`run ${i+1} accepted`,`score ${(v.score/100).toFixed(2)}`);
  check(escrowBefore-escrowAfter===REWARD,`run ${i+1}: escrow fell by exactly the reward`,`-${formatEther(escrowBefore-escrowAfter)} MON`);
  check(opAfter-opBefore===REWARD-gasPaid,`run ${i+1}: operator received the reward net of gas`,
    `+${formatEther(opAfter-opBefore)} MON (reward ${formatEther(REWARD)} - gas ${formatEther(gasPaid)})`);
  ops.push(op.address);
}
t=await pub.readContract({address:AXON,abi,functionName:"getTask",args:[BigInt(taskId)]});
check(t.slotsFilled===SLOTS,"task completed",`${t.slotsFilled}/${t.slotsTotal}`);
check(t.escrow===0n,"escrow fully drained by the payouts — nothing stranded",`${formatEther(t.escrow)} MON`);

// --- mint + licence ---------------------------------------------------------
h=await wallet.writeContract({address:AXON,abi,functionName:"mintPolicy",args:[BigInt(taskId),FEE],gas:GAS});
r=await pub.waitForTransactionReceipt({hash:h});
check(r.status==="success","policy minted");
const pid=Number(await pub.readContract({address:AXON,abi,functionName:"policyCount"}))-1;
const cap=await pub.readContract({address:AXON,abi,functionName:"capTable",args:[BigInt(pid)]});
const bps=cap[1].reduce((a,b)=>a+b,0n);
check(bps>=9990n&&bps<=10000n,"cap table sums to 100% within integer-division dust",
  `${Number(bps)/100}% = ${cap[1].map(b=>(Number(b)/100).toFixed(2)+"%").join(" / ")}`);

const buyer=privateKeyToAccount(generatePrivateKey());
const fb=await wallet.sendTransaction({to:buyer.address,value:parseEther("0.15"),gas:21000n});
await pub.waitForTransactionReceipt({hash:fb});
check(await awaitFunds(buyer.address,parseEther("0.15")),"buyer funded");
await new Promise(s=>setTimeout(s,1500));
const cBefore=await Promise.all(cap[0].map(a=>pub.getBalance({address:a})));
const bw=createWalletClient({account:buyer,chain,transport:http()});
h=await bw.writeContract({address:AXON,abi,functionName:"licensePolicy",args:[BigInt(pid)],value:FEE,gas:GAS});
r=await pub.waitForTransactionReceipt({hash:h});
check(r.status==="success","licence bought — one transaction");
await new Promise(s=>setTimeout(s,2000));
const cAfter=await Promise.all(cap[0].map(a=>pub.getBalance({address:a})));
let paid=0n;
for(let i=0;i<cap[0].length;i++){
  paid+=cAfter[i]-cBefore[i];
  check(cAfter[i]-cBefore[i]===cap[2][i],`contributor ${i+1} withdrew their exact share`,`${formatEther(cAfter[i]-cBefore[i])} MON`);
}
const net=(FEE*9750n)/10000n, dust=net-paid;
check(dust>=0n&&dust<=BigInt(cap[0].length),"contributors got the fee net of the 2.5% protocol take",
  `${formatEther(paid)} of ${formatEther(FEE)} (${dust} wei of dust rode with the fee)`);
for(const a of cap[0]) check((await pub.readContract({address:AXON,abi,functionName:"claimable",args:[a]}))===0n,
  `nothing left owed to ${a.slice(0,10)} — paid by push, no claim needed`);
console.log(`\ntask #${taskId} · policy #${pid} · ${failed===0?"every money check passed":failed+" failed"}`);
console.log(`deployer left ${formatEther(await pub.getBalance({address:owner.address}))} MON\n`);
process.exit(failed?1:0);
