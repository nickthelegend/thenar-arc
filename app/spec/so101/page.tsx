import type { Metadata } from "next";
import Link from "next/link";
import { DimRule } from "@/components/primitives";
import { So101BenchLoader } from "./bench-loader";
import { SO101, SO101_REACH, JAW_MM_PER_DEG } from "@/lib/so101";
import { EMBODIMENTS } from "@/lib/embodiment";

export const metadata: Metadata = {
  title: "SO-101 · MG996R — spec sheet",
  description:
    "The second arm a task can ask for: the open SO-101, built with MG996R servos. Solved from its CAD, drivable here, and mirrored to a real one on your desk.",
};

/**
 * Every figure here is read from lib/so101-spec.ts, which is exported from
 * thenar-arms' assembly manifest: the same one the GLB was built from and the
 * firmware's limits come from.
 */
export default function So101SpecPage() {
  const e = EMBODIMENTS.so101;
  return (
    <div className="mx-auto max-w-[1000px] px-5 py-10">
      <span className="text-[12px] text-scribe-3">
        <Link href="/spec" className="hover:text-scribe">THENAR-6</Link> <span className="text-rule-strong">/</span> SO-101
      </span>
      <h1 className="mt-2 font-display text-[clamp(2.4rem,6vw,3.6rem)] font-700 leading-[0.96] tracking-[-0.02em]">
        SO-101 <span className="text-scribe-3">· MG996R</span>
      </h1>
      <p className="mt-4 max-w-[64ch] text-[16px] leading-relaxed text-scribe-2">
        The open SO-101, built with hobby MG996R servos: an arm a contributor
        can own. A task that asks for it (<code className="font-mono text-[14px] text-scribe">[arm so101]</code> in
        its name on chain) is driven on this arm, recorded in its joints, and
        can be mirrored onto a real one on the same desk. Nothing here is a
        hand-written model: the chain, the limits and the mesh all come from the
        CAD in thenar-arms.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-px bg-rule sm:grid-cols-4">
        <Cell label="Axes" value="5 + jaw" />
        <Cell label="Reach" value={`${Math.round(SO101_REACH * 1000)} mm`} />
        <Cell label="Jaw" value={`0–${Math.round(SO101.limitsDeg[5][1] * JAW_MM_PER_DEG)} mm`} />
        <Cell label="Servos" value="6 × MG996R" />
      </div>

      <DimRule className="mt-12" note="Drive it" />
      <div className="mt-5">
        <So101BenchLoader />
      </div>
      <p className="mt-3 max-w-[64ch] text-[13px] leading-relaxed text-scribe-3">
        Gripper pointing down, turned along the reach, solved by damped least
        squares over the five reaching joints with each one held to its limit.
        When that stalls against a limit it tries again from home and keeps the
        closer answer.
      </p>

      <DimRule className="mt-12" note="Joints" />
      <div className="mt-5 overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-rule-strong">
            <th scope="col" className="label pb-2 text-left font-normal">Joint</th>
            <th scope="col" className="label hidden pb-2 text-left font-normal sm:table-cell">Node</th>
            <th scope="col" className="label pb-2 text-right font-normal">Limits</th>
            <th scope="col" className="label pb-2 text-right font-normal">Home</th>
          </tr>
        </thead>
        <tbody>
          {SO101.jointNames.map((n, i) => (
            <tr key={n} className="border-b border-rule">
              <td className="py-2.5 text-[14px]">{n}</td>
              <td className="hidden py-2.5 font-mono text-[12px] text-scribe-3 sm:table-cell">{SO101.joints[i]}</td>
              <td className="py-2.5 text-right font-mono text-[14px] tabular-nums text-signal">
                {SO101.limitsDeg[i][0]}° … {SO101.limitsDeg[i][1]}°
              </td>
              <td className="py-2.5 text-right font-mono text-[14px] tabular-nums text-scribe-2">{SO101.homeDeg[i]}°</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <DimRule className="mt-12" note="On your desk" />
      <ol className="mt-5 flex max-w-[70ch] list-decimal flex-col gap-2 pl-5 text-[15px] leading-relaxed text-scribe-2">
        <li>Flash thenar-arms&rsquo; firmware to the follower&rsquo;s ESP32 and plug it in.</li>
        <li>
          Start the relay on this computer:{" "}
          <code className="font-mono text-[13px] text-scribe">node scripts/arm-relay.mjs --follower /dev/cu.usbserial-… --arm</code>
        </li>
        <li>Press <span className="text-[13px]">Mirror to my SO-101</span> above, or on any SO-101 task&rsquo;s station.</li>
      </ol>
      <p className="mt-4 max-w-[70ch] text-[14px] leading-relaxed text-scribe-3">
        The relay listens on loopback only and accepts no other website. It arms
        only with <code className="font-mono">--arm</code> and only from home,
        refuses any pose that would put the gripper or the wrist into the table,
        and sends STOP the moment the page stops streaming. The firmware stops on
        its own if a target is more than 250 ms old.
      </p>

      <DimRule className="mt-12" note="In the dataset" />
      <p className="mt-4 max-w-[70ch] text-[15px] leading-relaxed text-scribe-2">
        An SO-101 run is exported with <code className="font-mono text-[13px] text-scribe">embodiment: &quot;{e.name}&quot;</code> and
        its six joint columns named ({e.joints.join(", ")}), so a corpus never
        mixes two machines and a buyer knows which arm the angles belong to.
      </p>

      <Link
        href="/hub"
        className="mt-10 inline-block border border-scribe bg-scribe px-5 py-2.5 text-[12px] text-ink-0 transition-colors hover:border-signal-hi hover:bg-signal-hi"
      >
        Find a task
      </Link>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 bg-ink-1 px-4 py-3">
      <span className="label">{label}</span>
      <span className="font-mono text-[16px] tabular-nums text-scribe">{value}</span>
    </div>
  );
}
