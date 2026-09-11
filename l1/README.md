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

**Known stopping point.** `initValidatorManager` reaches the L1's own RPC on
port 9656 and is refused, because the primary-network nodes do not track the new
subnet yet. The CLI prints the remedy after conversion: set the subnet ID it
gives you as `track-subnets` in `~/.avalanchego/config.json`, expose the P2P
port, set `public-ip`, and restart. Until a node serves that RPC, `scripts/l1.mjs`
has nothing to talk to.

Everything up to that point does work: the network comes up healthy, the subnet
and blockchain are created with real fees, and `ConvertSubnetToL1Tx` succeeds —
the subnet becomes a sovereign L1 with the genesis in this directory, which
carries the native minter, the fee manager and the warp precompile with the
deployer as admin.

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
