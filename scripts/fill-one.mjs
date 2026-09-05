/** Fill remaining slots with genuinely distinct runs, then mint and license.
 *  Distinctness comes from the sample count, not a sub-micron nudge: identical
 *  samples hash identically and the contract rightly refuses the replay. */
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, formatEther, parseEther, parseAbi } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
const BASE = process.argv[2], TASK = Number(process.argv[3]);
const env = Object.fromEntries(readFileSync(".env.deployer","utf8").split("\n").filter(Boolean).map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1)];}));
const chain={id:10143,name:"Monad Testnet",nativeCurrency:{name:"Monad",symbol:"MON",decimals:18},rpcUrls:{default:{http:["https://testnet-rpc.monad.xyz"]}}};
const abi=parseAbi([
"function submitTrajectory(uint256 taskId, bytes32 trajHash, string cid, uint16 score, bytes signature) returns (uint256)",
"function mintPolicy(uint256 taskId, uint128 licenceFee) returns (uint256)",
"function licensePolicy(uint256 policyId) payable",
"function policyCount() view returns (uint256)",
"function getTask(uint256) view returns ((string name, address funder, uint128 rewardPerTrajectory, uint128 escrow, uint32 slotsTotal, uint32 slotsFilled, uint8 scenario, uint8 difficulty, bool policyMinted))",
"function capTable(uint256) view returns (address[] who, uint256[] weightBps, uint256[] payout)",
"function getPolicy(uint256) view returns ((uint256 taskId, address minter, uint32 trajectories, uint64 mintedAt, uint128 licenceFee, uint32 licencesSold, uint128 distributed))"]);
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
// Each variant differs in sample count and end offset, so both the score and
// the hash differ from anything already on the ledger.
const VARIANTS=[[5.2,71],[3.9,83],[7.4,66],[2.9,97],[6.6,59]];
console.log(`deployer ${formatEther(await pub.getBalance({address:owner.address}))} MON`);
let t=await pub.readContract({address:AXON,abi,functionName:"getTask",args:[BigInt(TASK)]});
console.log(`task #${TASK} ${t.slotsFilled}/${t.slotsTotal}`);
for(let v=0; v<VARIANTS.length && t.slotsFilled<t.slotsTotal; v++){
  const [dev,secs]=VARIANTS[v];
  const op=privateKeyToAccount(generatePrivateKey());
  const f=await wallet.sendTransaction({to:op.address,value:parseEther("0.15"),gas:21000n});
  await pub.waitForTransactionReceipt({hash:f});
  if(!await awaitFunds(op.address,parseEther("0.15"))){check(false,"operator funded");continue;}
  await new Promise(r=>setTimeout(r,1500));
  const res=await fetch(`${BASE}/api/verify`,{method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({taskId:TASK,contributor:op.address,...makeRun(dev,secs)})});
  const vv=await res.json();
  if(!res.ok){check(false,`verify variant ${v}`,vv.error);continue;}
  try{
    const w=createWalletClient({account:op,chain,transport:http()});
    const h=await w.writeContract({address:AXON,abi,functionName:"submitTrajectory",args:[BigInt(TASK),vv.trajHash,vv.cid,vv.score,vv.signature],gas:GAS});
    const r=await pub.waitForTransactionReceipt({hash:h});
    await fetch(`${BASE}/api/submitted`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({trajHash:vv.trajHash,txHash:h})});
    check(r.status==="success",`slot filled by ${op.address.slice(0,8)}`,`score ${(vv.score/100).toFixed(2)} · ${secs}s`);
  }catch(e){ console.log(` FAIL  submit variant ${v} — ${String(e).split("\n")[0].slice(0,110)}`); failed++; }
  await new Promise(r=>setTimeout(r,1500));
  t=await pub.readContract({address:AXON,abi,functionName:"getTask",args:[BigInt(TASK)]});
}
if(t.slotsFilled!==t.slotsTotal){console.log(`\nstopped at ${t.slotsFilled}/${t.slotsTotal}; not minting an unfilled task`);process.exit(1);}
check(true,"every slot filled",`${t.slotsFilled}/${t.slotsTotal}`);
const FEE=parseEther("0.01");
let h=await wallet.writeContract({address:AXON,abi,functionName:"mintPolicy",args:[BigInt(TASK),FEE],gas:GAS});
let r=await pub.waitForTransactionReceipt({hash:h});
check(r.status==="success","mintPolicy confirmed",h.slice(0,18));
const pid=Number(await pub.readContract({address:AXON,abi,functionName:"policyCount"}))-1;
const cap=await pub.readContract({address:AXON,abi,functionName:"capTable",args:[BigInt(pid)]});
check(cap[0].length===t.slotsTotal,"cap table has every contributor",`${cap[0].length}`);
check(new Set(cap[1].map(String)).size>1,"weights differ between operators",cap[1].map(b=>(Number(b)/100).toFixed(2)+"%").join(", "));
const buyer=privateKeyToAccount(generatePrivateKey());
const fb=await wallet.sendTransaction({to:buyer.address,value:parseEther("0.15"),gas:21000n});
await pub.waitForTransactionReceipt({hash:fb});
check(await awaitFunds(buyer.address,parseEther("0.15")),"buyer funded");
await new Promise(r=>setTimeout(r,1500));
const before=await Promise.all(cap[0].map(a=>pub.getBalance({address:a})));
const bw=createWalletClient({account:buyer,chain,transport:http()});
h=await bw.writeContract({address:AXON,abi,functionName:"licensePolicy",args:[BigInt(pid)],value:FEE,gas:GAS});
r=await pub.waitForTransactionReceipt({hash:h});
check(r.status==="success","licensePolicy — one tx pays every contributor",h.slice(0,18));
await new Promise(r=>setTimeout(r,2000));
const after=await Promise.all(cap[0].map(a=>pub.getBalance({address:a})));
for(let i=0;i<cap[0].length;i++) check(after[i]-before[i]===cap[2][i],`contributor ${i+1} paid the exact cap-table share`,`${formatEther(after[i]-before[i])} MON`);
console.log(`policy #${pid} on task #${TASK} · ${failed===0?"passed":failed+" failed"}`);
console.log(`deployer left ${formatEther(await pub.getBalance({address:owner.address}))} MON`);
process.exit(failed?1:0);
