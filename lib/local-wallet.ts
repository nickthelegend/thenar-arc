"use client";

import { createConnector } from "wagmi";
import {
  createWalletClient, http, numberToHex, hexToBigInt,
  type Address, type EIP1193Provider, type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { ARC_NETWORK, RPC_ENDPOINTS, appChain } from "@/lib/chain";
import { noteSynced } from "@/lib/receipt-timers";

/** Opt-in browser-held testnet wallet, also used by local forks.
 * Keys never leave browser storage. Mainnet is rejected before key access.
 * Testnet writes and payment signatures require explicit confirmation.
 */
const KEY = ARC_NETWORK === "testnet" ? "thenar:testnet:dev-key" : "thenar:localnet:key";
const CONNECTED = ARC_NETWORK === "testnet" ? "thenar:testnet:dev-connected" : "thenar:localnet:connected";

let memoryKey: Hex | null = null;
function privateKey(): Hex {
  if (ARC_NETWORK === "mainnet") throw new Error("Browser dev wallets are disabled on mainnet.");
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
  const wallet = createWalletClient({ account, chain: appChain, transport: http(RPC_ENDPOINTS[0]) });

  const request = async ({ method, params }: { method: string; params?: unknown }) => {
    const p = (params ?? []) as unknown[];
    switch (method) {
      case "eth_accounts":
      case "eth_requestAccounts":
        return [account.address];
      case "eth_chainId":
        return numberToHex(appChain.id);
      case "wallet_switchEthereumChain": {
        const id = Number((p[0] as { chainId: Hex }).chainId);
        if (id !== appChain.id) throw Object.assign(new Error(`This wallet is on chain ${appChain.id} only.`), { code: 4902 });
        return null;
      }
      case "personal_sign":
        if (ARC_NETWORK === "testnet" && !window.confirm("Testnet dev wallet: sign this message?")) throw new Error("User rejected signature");
        return account.signMessage({ message: { raw: p[0] as Hex } });
      case "eth_signTypedData_v4": {
        const raw = p[1];
        const t = (typeof raw === "string" ? JSON.parse(raw) : raw) as {
          domain: Record<string, unknown>; types: Record<string, unknown>; primaryType: string; message: Record<string, unknown>;
        };
        if (t.domain.chainId !== undefined && Number(t.domain.chainId) !== 5042002) throw new Error("Dev wallet signs only for Arc testnet.");
        if (ARC_NETWORK === "testnet" && !window.confirm(`Testnet dev wallet: sign ${t.primaryType} for ${String(t.domain.verifyingContract ?? "this app")}? This may authorise a USDC payment.`)) throw new Error("User rejected signature");
        const types = { ...t.types };
        delete types.EIP712Domain;
        return account.signTypedData({ domain: t.domain, types, primaryType: t.primaryType, message: t.message } as never);
      }
      case "eth_sendTransaction": {
        const tx = p[0] as TxParams;
        if (ARC_NETWORK === "testnet" && !window.confirm(`Send a real Arc TESTNET transaction to ${tx.to}? Gas is paid in test USDC.`)) throw new Error("User rejected transaction");
        // Prepared and signed here, then sent with eth_sendRawTransactionSync
        // (EIP-7966) where the node serves it: the node answers with the
        // receipt itself, so there is no polling and the send is the only thing
        // timed. Otherwise it is sent the ordinary way. Thenar never sends
        // native value; a `value` here would only come from a hand-made request.
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
    name: ARC_NETWORK === "testnet" ? "Testnet dev wallet" : "Local wallet",
    type: "thenarLocal",
    async connect() {
      remember(true);
      return { accounts: [address()], chainId: appChain.id } as never;
    },
    async disconnect() {
      remember(false);
    },
    async getAccounts() {
      return [address()];
    },
    async getChainId() {
      return appChain.id;
    },
    async getProvider() {
      return (p ??= provider());
    },
    async isAuthorized() {
      return remembered();
    },
    async switchChain({ chainId }) {
      if (chainId !== appChain.id) throw new Error(`This wallet is on chain ${appChain.id} only.`);
      return appChain;
    },
    onAccountsChanged() {},
    onChainChanged() {},
    onDisconnect() {
      config.emitter.emit("disconnect");
    },
  }));
}
