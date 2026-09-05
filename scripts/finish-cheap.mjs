/** Fill the last slot, mint and license — with explicit gas caps, because
 *  Monad reserves value + gas_limit * price and the deployer is nearly dry. */
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
const AXON=env.AXON_ADDRESS, GAS=400000n;
const pub=createPublicClient({chain,transport:http()});
const owner=privateKeyToAccount(env.DEPLOYER_PRIVATE_KEY);
const wallet=createWalletClient({account:owner,chain,transport:http()});
let failed=0; const check=(ok,m,x="")=>{if(!ok)failed++;console.log(`${ok?"  ok  ":" FAIL "} ${m}${x?` — ${x}`:""}`);};
async function awaitFunds(a,w){for(let i=0;i<80;i++){if((await pub.getBalance({address:a}))>=w)return true;await new Promise(r=>setTimeout(r,250));}return false;}
function makeRun(dev,secs,ease,seed){
  const hz=20,n=hz*secs,from=[0.3,0.2],goal=[0.17,-0.24],s=[];
  for(let i=0;i<=n;i++){const u=i/n;const p=Math.min(1,Math.max(0,u<ease?(u/ease)**2*ease:ease+(u-ease)));
    s.push({t:+(i/hz).toFixed(3),q:[0.1*p,0.5*p,0.9*p,0,1.2*p,0],grip:u>0.05&&u<0.95?6:42,
      object:[from[0]+(goal[0]-from[0])*p+seed*1e-9,from[1]+(goal[1]-from[1])*p,Math.sin(Math.PI*u)*0.18]});}
  s[s.length-1].object=[goal[0]+dev/1000,goal[1],0];
  return {samples:s,durationSeconds:secs,deviationMm:dev,success:true};
}
console.log(`deployer ${formatEther(await pub.getBalance({address:owner.address}))} MON`);
let t=await pub.readContract({address:AXON,abi,functionName:"getTask",args:[BigInt(TASK)]});
console.log(`task #${TASK} ${t.slotsFilled}/${t.slotsTotal}`);
while(t.slotsFilled<t.slotsTotal){
  const op=privateKeyToAccount(generatePrivateKey());
  const f=await wallet.sendTransaction({to:op.address,value:parseEther("0.12"),gas:21000n});
  await pub.waitForTransactionReceipt({hash:f});
  check(await awaitFunds(op.address,parseEther("0.12")),"operator funded",op.address.slice(0,10));
  await new Promise(r=>setTimeout(r,1500));
  const res=await fetch(`${BASE}/api/verify`,{method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({taskId:TASK,contributor:op.address,...makeRun(6.1,88,0.36,Date.now()%1e6)})});
  const v=await res.json();
  if(!res.ok){check(false,"verify",v.error);break;}
  const w=createWalletClient({account:op,chain,transport:http()});
  const h=await w.writeContract({address:AXON,abi,functionName:"submitTrajectory",args:[BigInt(TASK),v.trajHash,v.cid,v.score,v.signature],gas:GAS});
  const r=await pub.waitForTransactionReceipt({hash:h});
  await fetch(`${BASE}/api/submitted`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({trajHash:v.trajHash,txHash:h})});
  check(r.status==="success","slot filled",`score ${(v.score/100).toFixed(2)}`);
  await new Promise(r=>setTimeout(r,1500));
  t=await pub.readContract({address:AXON,abi,functionName:"getTask",args:[BigInt(TASK)]});
}
check(t.slotsFilled===t.slotsTotal,"every slot filled",`${t.slotsFilled}/${t.slotsTotal}`);
const FEE=parseEther("0.005");
let h=await wallet.writeContract({address:AXON,abi,functionName:"mintPolicy",args:[BigInt(TASK),FEE],gas:GAS});
let r=await pub.waitForTransactionReceipt({hash:h});
check(r.status==="success","mintPolicy confirmed",h.slice(0,18));
const pid=Number(await pub.readContract({address:AXON,abi,functionName:"policyCount"}))-1;
const cap=await pub.readContract({address:AXON,abi,functionName:"capTable",args:[BigInt(pid)]});
check(cap[0].length===t.slotsTotal,"cap table has every contributor",`${cap[0].length}`);
check(new Set(cap[1].map(String)).size>1,"weights differ between operators",cap[1].map(b=>(Number(b)/100).toFixed(2)+"%").join(", "));
const buyer=privateKeyToAccount(generatePrivateKey());
const fb=await wallet.sendTransaction({to:buyer.address,value:parseEther("0.09"),gas:21000n});
await pub.waitForTransactionReceipt({hash:fb});
check(await awaitFunds(buyer.address,parseEther("0.09")),"buyer funded");
await new Promise(r=>setTimeout(r,1500));
const before=await Promise.all(cap[0].map(a=>pub.getBalance({address:a})));
const bw=createWalletClient({account:buyer,chain,transport:http()});
h=await bw.writeContract({address:AXON,abi,functionName:"licensePolicy",args:[BigInt(pid)],value:FEE,gas:GAS});
r=await pub.waitForTransactionReceipt({hash:h});
check(r.status==="success","licensePolicy — one tx pays every contributor",h.slice(0,18));
await new Promise(r=>setTimeout(r,2000));
const after=await Promise.all(cap[0].map(a=>pub.getBalance({address:a})));
for(let i=0;i<cap[0].length;i++) check(after[i]-before[i]===cap[2][i],`contributor ${i+1} paid the exact cap-table share`,`${formatEther(after[i]-before[i])} MON`);
const pol=await pub.readContract({address:AXON,abi,functionName:"getPolicy",args:[BigInt(pid)]});
check(pol.licencesSold===1,"licence counted on chain");
console.log(`policy #${pid} on task #${TASK} · ${failed===0?"passed":failed+" failed"}`);
console.log(`deployer left ${formatEther(await pub.getBalance({address:owner.address}))} MON`);
process.exit(failed?1:0);
