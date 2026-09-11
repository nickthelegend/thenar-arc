# The L1

Three of the hundred ideas need a chain of our own rather than somebody's
testnet: a native gas token (36), a fee schedule the operator sets (33), and a
policy delivered to a second chain (32). All three were parked for weeks behind
"needs an L1 I cannot fund", which turned out to be a premise rather than a
fact — `avalanche-cli` runs a sovereign L1 locally, with real validators, its
own token and its own precompiles.

## Bringing it up

Verified against **avalanche-cli 1.9.6** on 3 Sep 2026. The commands below differ
from the ones this file used to carry, which were written for an older CLI and
no longer complete.

```
avalanche blockchain create thenar2 \
  --genesis l1/genesis-with-headroom.json --evm --vm-version v0.8.0 \
  --proof-of-authority --validator-manager-owner <deployer> \
  --evm-token THN --icm

# --bootstrap-endpoints is required. Without it the conversion fails with
# "conversion must include at least one validator", and --num-bootstrap-validators
# on its own does not satisfy it: the endpoint of a running node must be named.
avalanche blockchain deploy thenar2 --local \
  --bootstrap-endpoints http://127.0.0.1:9650 --balance 1

# The key must be bare hex. With an 0x prefix the CLI reports
# "failed to load private key: invalid private key ending".
avalanche contract initValidatorManager thenar2 --local \
  --private-key $(grep DEPLOYER_PRIVATE_KEY ../.env.deployer | cut -d= -f2 | sed 's/^0x//')

avalanche interchain relayer deploy --local --cchain --blockchains thenar2 \
  --key ewoq --cchain-funding-key ewoq --blockchain-funding-key ewoq
```

**The invocation that works** is `--use-local-machine` together with
`--num-bootstrap-validators 1`. Those two cannot be combined with
`--bootstrap-endpoints` — the CLI refuses both at once — and using
`--bootstrap-endpoints` alone converts the subnet but leaves no node serving the
L1's RPC, which is a dead end: `blockchain join` refuses sovereign L1s, and a
node started with `track-subnets` in `--node-config` comes up reporting no such
chain. With the working invocation the CLI deploys ICM, starts the relayer, and
prints the RPC endpoint itself.

**One thing to do before `scripts/l1.mjs`:** the ewoq account holds nothing on
the new L1, and claim 32 deploys its receiver there. Mint it some THN through
the native minter at `0x0200000000000000000000000000000000000001` — the same
facility claim 36 exercises — or the run fails on funds.

Result of the last run is committed at `docs/l1-proof.txt`: all three claims
shown, the policy delivered across chains ten seconds after minting.

`blockchain describe thenar2` prints the RPC endpoint and the blockchain ID.
Then:

```
L1_RPC=http://127.0.0.1:9656/ext/bc/<id>/rpc node scripts/l1.mjs
```

The script reads every claim back off the chain rather than reporting what it
sent, and exits non-zero if any of the three cannot be shown.

## Two genesis files, and why

`genesis.json` is the first chain. `genesis-with-headroom.json` is the same
thing with `minBaseFee` at 25 gwei instead of 1, which exists because of how
the first chain died.

The fee manager lets an admin set the whole fee schedule at runtime. I set
`minBaseFee` to 0 *and* dropped `baseFeeChangeDenominator` to 2 to make the
descent quick, and it was quick: the base fee fell from 462,026,903 wei to 1
wei in a single block, and block production stopped. Block 15 is the last one
that chain ever produced. Every transaction after it failed to mine, including
one offering a 200 gwei tip at the head nonce, and nothing was logged above
DEBUG. The bad config is in accepted state, so restarting the node does not
help.

So the second chain starts higher, and `scripts/l1.mjs` changes the floor and
nothing else — the denominator and the block gas cost stay where the chain was
born. The base fee then walks down to the new floor over a few hundred blocks
and stops there, which is the behaviour the precompile documents. On the run
recorded in IDEAS.md that was 25 gwei to 1,000,000 wei: a 21,000-gas run went
from 0.000525 THN to 0.000000021 THN, and the chain kept producing.

The lesson is worth more than the feature. A precompile that can set the fee
schedule can set it somewhere the chain cannot recover from, and there is no
warning and no error — the chain simply stops.
