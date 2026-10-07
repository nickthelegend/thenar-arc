"use client";

import { useEffect, useState } from "react";
import { CURRENCY, addressUrl, txUrl } from "@/lib/chain";
import { readableError } from "@/lib/fetch-error";

/**
 * The corpus as shares on Monad.
 *
 * Every recording on Thenar was made by a person driving the arm, and this is
 * where that shows up as ownership: CorpusShares, a whitelisted token whose
 * holders are the operators. The page reads the contract itself — its supply,
 * its whitelist, its dividends — and the log of every write this server made
 * to it, each linked to Monadscan.
 */

type Security = {
  address: string;
  url: string;
  issuer: string;
  name: string;
  symbol: string;
  totalSupply: string;
  whitelist: { address: string; balance: string }[];
  whitelistCount: number;
  dividends: number;
  events: { tx: string; kind: "admit" | "issue" | "dividend"; account: string | null; amount: string | null; detail: string | null; created_at: number }[];
};

type Holder = {
  address: string;
  listed: boolean;
  shares: string;
  dividends: { id: number; tokenBalance: string; amountWei: string; recordDate: number; executionDate: number; recordDateReached: boolean; claimed: boolean }[];
  compliance: { allowed: boolean; rule: string | null };
};

const short = (s: string) => (s.length > 20 ? `${s.slice(0, 10)}…${s.slice(-6)}` : s);
const when = (ms: number) => new Date(ms).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

const KIND: Record<Security["events"][number]["kind"], string> = {
  admit: "Whitelisted a verified human",
  issue: "Issued shares for a paid run",
  dividend: "Declared a dividend",
};

export default function CorpusTokenPage() {
  const [security, setSecurity] = useState<Security | { error: string } | null>(null);
  const [address, setAddress] = useState("");
  const [holder, setHolder] = useState<Holder | { error: string } | null>(null);
  const [checking, setChecking] = useState(false);
  // The hint waits until the field is left or submitted: shown on every
  // keystroke, it flashed "not an address" all the way through typing one.
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/tokenize")
      .then(async (r) => {
        const body = await r.json();
        if (live) setSecurity(r.ok ? body : { error: body.error ?? `the security answered ${r.status}` });
      })
      .catch((e) => live && setSecurity({ error: readableError(e) }));
    return () => {
      live = false;
    };
  }, []);

  async function lookup() {
    setChecking(true);
    try {
      const r = await fetch(`/api/tokenize?address=${encodeURIComponent(address.trim())}`);
      const body = await r.json();
      setHolder(r.ok ? body : { error: body.error ?? `answered ${r.status}` });
    } catch (e) {
      setHolder({ error: readableError(e) });
    } finally {
      setChecking(false);
    }
  }

  const s = security && "address" in security ? security : null;
  const validAddress = /^0x[0-9a-fA-F]{40}$/.test(address.trim());

  return (
    <div className="mx-auto max-w-[900px] px-5 py-8">
      <h1 className="font-display text-4xl font-600 leading-none">Corpus shares</h1>
      <p className="mt-3 max-w-[640px] text-[15px] leading-relaxed text-scribe-2">
        The recordings are owned by the people who made them. Thenar&rsquo;s corpus is a token on Monad
        that only a whitelisted address can hold, send or receive, and Thenar adds an address only after
        its owner signs in with a passkey that the registry on Monad verifies. Every paid run issues its share, scaled by its score, and corpus
        sales are paid out to holders as dividends in {CURRENCY}, snapshotted at a record date set in advance.
      </p>

      <section className="mt-8 border border-rule">
        <div className="border-b border-rule px-4 py-2.5">
          <span className="label">The shares</span>
        </div>
        {security === null ? (
          <p className="px-4 py-4 text-[13px] text-scribe-3">Reading the shares from Monad&hellip;</p>
        ) : !s ? (
          <p className="px-4 py-4 text-[13px] text-scribe-2">{"error" in security ? security.error : ""}</p>
        ) : (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-4 font-mono text-[13px] sm:grid-cols-3">
            <Fact label="Name" value={`${s.name} (${s.symbol})`} />
            <Fact label="Issuer" value={short(s.issuer)} />
            <Fact label="Shares issued" value={s.totalSupply} />
            <Fact label="Whitelisted holders" value={String(s.whitelistCount)} />
            <Fact label="Dividends declared" value={String(s.dividends)} />
            <div className="flex flex-col gap-0.5">
              <dt className="label">On Monadscan</dt>
              <dd>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-probe hover:underline"
                >
                  {short(s.address)} &#8599;
                </a>
              </dd>
            </div>
          </dl>
        )}
        <p className="border-t border-rule px-4 py-2.5 text-[12px] leading-relaxed text-scribe-3">
          The whitelist, the snapshot and the payout are the contract&rsquo;s rules, not this server&rsquo;s:
          source in <span className="font-mono">contracts/src/CorpusShares.sol</span>, and only the{" "}
          {s ? (
            <a href={addressUrl(s.issuer)} target="_blank" rel="noreferrer" className="underline underline-offset-4">
              issuer
            </a>
          ) : "issuer"}{" "}
          can admit a holder or issue a share.
        </p>
      </section>

      {s ? (
        <section className="mt-6 border border-rule">
          <div className="border-b border-rule px-4 py-2.5">
            <span className="label">Holders</span>
          </div>
          {s.whitelist.length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-scribe-3">Nobody is on the whitelist yet.</p>
          ) : (
            <ul className="divide-y divide-rule">
              {s.whitelist.map((h) => (
                <li key={h.address} className="flex items-center justify-between px-4 py-2 font-mono text-[13px]">
                  <span className="text-scribe-2">{h.address}</span>
                  <span className="tabular-nums text-scribe">{h.balance} {s.symbol}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="mt-6 border border-rule">
        <div className="border-b border-rule px-4 py-2.5">
          <span className="label">Look up a holder</span>
        </div>
        <form
          className="flex flex-wrap gap-2 px-4 py-4"
          onSubmit={(e) => { e.preventDefault(); setTouched(true); if (validAddress && !checking) void lookup(); }}
        >
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onBlur={() => setTouched(address.trim() !== "")}
            placeholder="0x… operator address"
            aria-label="Holder address"
            spellCheck={false}
            className="min-w-[280px] flex-1 border border-rule bg-ink-1 px-3 py-2 font-mono text-[13px] text-scribe outline-none focus:border-scribe-3"
          />
          <button
            type="submit"
            disabled={checking || !validAddress}
            className="border border-rule-strong bg-ink-3 px-4 py-2 text-[13px] text-scribe hover:border-scribe-3 disabled:opacity-50"
          >
            {checking ? "Asking the contract…" : "Check"}
          </button>
          {touched && address.trim() !== "" && !validAddress ? (
            // A disabled button with no reason reads as a broken page.
            <p className="w-full text-[13px] text-reject">
              That is not an address. It should be 0x followed by 40 hexadecimal characters.
            </p>
          ) : null}
        </form>
        {holder ? (
          "error" in holder ? (
            <p className="border-t border-rule px-4 py-3 text-[13px] text-scribe-2">{holder.error}</p>
          ) : (
            <div className="flex flex-col gap-2 border-t border-rule px-4 py-3 font-mono text-[13px]">
              <span className="text-scribe-2">
                {holder.listed ? "On the whitelist" : "Not on the whitelist"} · {holder.shares} shares
              </span>
              <span className={holder.compliance.allowed ? "text-go" : "text-reject"}>
                {holder.compliance.allowed
                  ? "The contract would accept a share for this address."
                  : `The contract refuses a share for this address: ${holder.compliance.rule}`}
              </span>
              {holder.dividends.map((d) => (
                <span key={d.id} className="text-scribe-3">
                  Dividend {d.id}: {d.recordDateReached
                    ? `${d.tokenBalance} shares at the record date · ${Number(d.amountWei) / 1e18} ${CURRENCY} owed${d.claimed ? ", claimed" : ""}`
                    : "record date not reached yet"}
                </span>
              ))}
            </div>
          )
        ) : null}
      </section>

      {s && s.events.length > 0 ? (
        <section className="mt-6 border border-rule">
          <div className="border-b border-rule px-4 py-2.5">
            {/* This server's writes, from its own log. The issuer can also write
                from scripts/shares.mjs; those are on chain and in the figures
                above, not in this list, so it does not claim to be every write. */}
            <span className="label">Every write this server made to the shares</span>
          </div>
          <ul className="divide-y divide-rule">
            {s.events.map((e) => (
              <li key={e.tx} className="flex flex-col gap-0.5 px-4 py-2.5 text-[13px]">
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-scribe">{KIND[e.kind]}</span>
                  <a href={txUrl(e.tx)} target="_blank" rel="noreferrer" className="font-mono text-[12px] text-probe hover:underline">
                    {short(e.tx)} &#8599;
                  </a>
                </span>
                <span className="font-mono text-[12px] text-scribe-3">
                  {when(e.created_at)}
                  {e.account ? ` · ${short(e.account)}` : ""}
                  {e.amount ? ` · ${e.amount}` : ""}
                  {e.detail ? ` · ${short(e.detail)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="label">{label}</dt>
      <dd className="text-scribe">{value}</dd>
    </div>
  );
}
