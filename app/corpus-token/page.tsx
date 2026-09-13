"use client";

import { useEffect, useState } from "react";
import { ATS } from "@/lib/ats";
import { readableError } from "@/lib/fetch-error";

/**
 * The corpus as a security on Hedera.
 *
 * Every recording on Thenar was made by a person driving the arm, and this is
 * where that shows up as ownership: an equity issued through Hedera's Asset
 * Tokenization Studio, whose holders are the operators. The page reads the
 * security itself — its supply, its whitelist, its dividends — and the log of
 * every write this server made to it, each linked to HashScan.
 */

type Security = {
  address: string;
  id: string | null;
  name: string;
  symbol: string;
  isin: string;
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
  dividends: { id: number; tokenBalance: string; amount: string; amountDecimals: number; recordDate: number; executionDate: number; recordDateReached: boolean }[];
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
        The recordings are owned by the people who made them. Thenar&rsquo;s corpus is an equity issued
        through Hedera&rsquo;s Asset Tokenization Studio. Holding it takes a place on its whitelist, and
        Thenar adds an address only after a World ID proof of a live human &mdash; the one exception is the
        issuer, which holds the unissued reserve. Every paid run issues its share, and corpus sales are
        paid out to holders as dividends.
      </p>

      <section className="mt-8 border border-rule">
        <div className="border-b border-rule px-4 py-2.5">
          <span className="label">The security</span>
        </div>
        {security === null ? (
          <p className="px-4 py-4 text-[13px] text-scribe-3">Reading the security from Hedera&hellip;</p>
        ) : !s ? (
          <p className="px-4 py-4 text-[13px] text-scribe-2">{"error" in security ? security.error : ""}</p>
        ) : (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-4 font-mono text-[13px] sm:grid-cols-3">
            <Fact label="Name" value={`${s.name} (${s.symbol})`} />
            <Fact label="ISIN" value={s.isin} />
            <Fact label="Shares issued" value={s.totalSupply} />
            <Fact label="Whitelisted holders" value={String(s.whitelistCount)} />
            <Fact label="Dividends declared" value={String(s.dividends)} />
            <div className="flex flex-col gap-0.5">
              <dt className="label">On HashScan</dt>
              <dd>
                <a
                  href={`${ATS.hashscan}/contract/${s.id ?? s.address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-probe hover:underline"
                >
                  {s.id ?? short(s.address)} &#8599;
                </a>
              </dd>
            </div>
          </dl>
        )}
        <p className="border-t border-rule px-4 py-2.5 text-[12px] leading-relaxed text-scribe-3">
          Issued through the Studio&rsquo;s factory{" "}
          <a href={`${ATS.hashscan}/contract/${ATS.factory.id}`} target="_blank" rel="noreferrer" className="underline underline-offset-4">
            {ATS.factory.id}
          </a>{" "}
          on the resolver{" "}
          <a href={`${ATS.hashscan}/contract/${ATS.resolver.id}`} target="_blank" rel="noreferrer" className="underline underline-offset-4">
            {ATS.resolver.id}
          </a>
          . The business logic is Hedera&rsquo;s; Thenar deployed only the security.
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
            {checking ? "Asking the security…" : "Check"}
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
                  ? "The security would accept a share for this address."
                  : `The security refuses a share for this address: ${holder.compliance.rule}`}
              </span>
              {holder.dividends.map((d) => (
                <span key={d.id} className="text-scribe-3">
                  Dividend {d.id}: {d.recordDateReached ? `${d.tokenBalance} shares at the record date` : "record date not reached yet"}
                </span>
              ))}
            </div>
          )
        ) : null}
      </section>

      {s && s.events.length > 0 ? (
        <section className="mt-6 border border-rule">
          <div className="border-b border-rule px-4 py-2.5">
            <span className="label">Every write to the security</span>
          </div>
          <ul className="divide-y divide-rule">
            {s.events.map((e) => (
              <li key={e.tx} className="flex flex-col gap-0.5 px-4 py-2.5 text-[13px]">
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-scribe">{KIND[e.kind]}</span>
                  <a href={`${ATS.hashscan}/transaction/${e.tx}`} target="_blank" rel="noreferrer" className="font-mono text-[12px] text-probe hover:underline">
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
