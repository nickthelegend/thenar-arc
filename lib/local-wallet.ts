"use client";

import { createConnector } from "wagmi";
import {
  createPublicClient, createWalletClient, http, numberToHex, hexToBigInt,
  type Address, type EIP1193Provider, type Hex,
} from "viem";
import { localSponsored, SPONSORED_ACCOUNT, SPONSORED_ACCOUNT_ABI, delegationCode, sponsoredDigest } from "@/lib/local-sponsor";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { LOCAL_RPC, thenarLocalnet } from "@/lib/chain";
import { noteSynced } from "@/lib/receipt-timers";

/**
 * The wallet a person uses on the local chain.
 *
 * On Monad an operator signs in through Privy, which makes them a wallet from
 * an email address. Privy knows nothing of a chain on this machine, so on the
 * local chain the wallet is a key this browser makes and keeps — the way
 * a local development chain is usually driven. It signs every
 * transaction and message itself and sends them to the local node, so what
 * reaches the chain is a real signed transaction from a real key, only one
 * with no value anywhere but here.
 *
 * Built only into NEXT_PUBLIC_CHAIN=local builds. A browser wallet (MetaMask,
 * Rabby) pointed at the local chain works as well, through wagmi's injected
 * connector beside this one.
 */
const KEY = "thenar:localnet:key";
const CONNECTED = "thenar:localnet:connected";

let memoryKey: Hex | null = null;
function privateKey(): Hex {
  try {
    let k = localStorage.getItem(KEY) as Hex | null;
    if (!k) {
      k = generatePrivateKey();
      localStorage.setItem(KEY, k);
    }
    return k;
  } catch {
    return (memoryKey ??= generatePrivateKey());
  }
}

const remember = (on: boolean) => {
  try {
    if (on) localStorage.setItem(CONNECTED, "1");
    else localStorage.removeItem(CONNECTED);
  } catch {
    /* private window: the wallet still works, it just forgets */
  }
};
const remembered = () => {
  try {
    return localStorage.getItem(CONNECTED) === "1";
  } catch {
    return false;
  }
};

type TxParams = {
  to?: Address; data?: Hex; value?: Hex; gas?: Hex; nonce?: Hex;
  maxFeePerGas?: Hex; maxPriorityFeePerGas?: Hex; gasPrice?: Hex;
};
const big = (h?: Hex) => (h === undefined ? undefined : hexToBigInt(h));

function provider(): EIP1193Provider {
  const account = privateKeyToAccount(privateKey());
  const wallet = createWalletClient({ account, chain: thenarLocalnet, transport: http(LOCAL_RPC) });

  /**
   * Hand the call to the local sponsor instead of paying for it: the local
   * stand-in for Privy's gas sponsorship (lib/local-sponsor.ts). The first
   * time, this address also signs an EIP-7702 authorisation to the sponsored
   * account. Every call is signed here, so the sponsor can deliver only what
   * this key approved.
   */
  const sponsoredSend = async (to: Address, value: bigint, data: Hex): Promise<Hex> => {
    const implementation = SPONSORED_ACCOUNT as Address;
    const node = createPublicClient({ chain: thenarLocalnet, transport: http(LOCAL_RPC) });
    const code = ((await node.getCode({ address: account.address })) ?? "0x").toLowerCase();
    const delegated = code === delegationCode(implementation);
    const authorization = delegated
      ? undefined
      : await account.signAuthorization({
          contractAddress: implementation, chainId: thenarLocalnet.id,
          nonce: await node.getTransactionCount({ address: account.address }),
        });
    const n = delegated
      ? await node.readContract({ address: account.address, abi: SPONSORED_ACCOUNT_ABI, functionName: "nonce" })
      : 0n;
    const signature = await account.signMessage({ message: { raw: sponsoredDigest(thenarLocalnet.id, account.address, n, to, value, data) } });
    const r = await fetch("/api/localnet/sponsor", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        from: account.address, target: to, value: value.toString(), data, signature,
        // The fields the sponsor needs, as JSON: viem's signed authorisation also carries `v` as a bigint.
        ...(authorization
          ? {
              authorization: {
                address: authorization.address, chainId: authorization.chainId, nonce: Number(authorization.nonce),
                r: authorization.r, s: authorization.s, yParity: authorization.yParity ?? 0,
              },
            }
          : {}),
      }),
    });
    const b = (await r.json().catch(() => ({}))) as { hash?: Hex; error?: string };
    if (!r.ok || !b.hash) throw new Error(b.error ?? `The sponsor answered ${r.status}.`);
    return b.hash;
  };

  const request = async ({ method, params }: { method: string; params?: unknown }) => {
    const p = (params ?? []) as unknown[];
    switch (method) {
      case "eth_accounts":
      case "eth_requestAccounts":
        return [account.address];
      case "eth_chainId":
        return numberToHex(thenarLocalnet.id);
      case "wallet_switchEthereumChain": {
        const id = Number((p[0] as { chainId: Hex }).chainId);
        if (id !== thenarLocalnet.id) throw Object.assign(new Error(`This wallet is on chain ${thenarLocalnet.id} only.`), { code: 4902 });
        return null;
      }
      case "personal_sign":
        return account.signMessage({ message: { raw: p[0] as Hex } });
      case "eth_signTypedData_v4": {
        const raw = p[1];
        const t = (typeof raw === "string" ? JSON.parse(raw) : raw) as {
          domain: Record<string, unknown>; types: Record<string, unknown>; primaryType: string; message: Record<string, unknown>;
        };
        const { EIP712Domain: _, ...types } = t.types;
        return account.signTypedData({ domain: t.domain, types, primaryType: t.primaryType, message: t.message } as never);
      }
      case "eth_sendTransaction": {
        const tx = p[0] as TxParams;
        if (localSponsored() && SPONSORED_ACCOUNT && tx.to) return sponsoredSend(tx.to, big(tx.value) ?? 0n, tx.data ?? "0x");
        // Prepared and signed here, then sent with eth_sendRawTransactionSync
        // (EIP-7966, which Monad serves): the node answers with the receipt
        // itself, so there is no polling, and the send is the only thing timed.
        const prepared = await wallet.prepareTransactionRequest({
          to: tx.to, data: tx.data, value: big(tx.value), gas: big(tx.gas), nonce: tx.nonce ? Number(tx.nonce) : undefined,
          ...(tx.maxFeePerGas ? { maxFeePerGas: big(tx.maxFeePerGas), maxPriorityFeePerGas: big(tx.maxPriorityFeePerGas) } : {}),
        } as never);
        const serializedTransaction = await wallet.signTransaction(prepared as never);
        const sentAt = performance.now();
        try {
          const receipt = await wallet.sendRawTransactionSync({ serializedTransaction });
          noteSynced(receipt.transactionHash, sentAt, performance.now());
          return receipt.transactionHash;
        } catch (e) {
          // A node without the method: send it the ordinary way. Any other error is the transaction's own.
          if (!/method.*(not (found|supported)|does not exist)|unsupported method/i.test(String((e as Error).message))) throw e;
          return wallet.sendRawTransaction({ serializedTransaction });
        }
      }
      default:
        // Everything else is a read, and the node answers it.
        return wallet.request({ method, params } as never);
    }
  };
  return { request, on: () => undefined, removeListener: () => undefined } as unknown as EIP1193Provider;
}

export function localWallet() {
  let p: EIP1193Provider | null = null;
  const address = () => privateKeyToAccount(privateKey()).address;
  return createConnector<EIP1193Provider>((config) => ({
    id: "thenarLocal",
    name: "Local wallet",
    type: "thenarLocal",
    async connect() {
      remember(true);
      return { accounts: [address()], chainId: thenarLocalnet.id } as never;
    },
    async disconnect() {
      remember(false);
    },
    async getAccounts() {
      return [address()];
    },
    async getChainId() {
      return thenarLocalnet.id;
    },
    async getProvider() {
      return (p ??= provider());
    },
    async isAuthorized() {
      return remembered();
    },
    async switchChain({ chainId }) {
      if (chainId !== thenarLocalnet.id) throw new Error(`This wallet is on chain ${thenarLocalnet.id} only.`);
      return thenarLocalnet;
    },
    onAccountsChanged() {},
    onChainChanged() {},
    onDisconnect() {
      config.emitter.emit("disconnect");
    },
  }));
}
