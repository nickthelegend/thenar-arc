"use client";

import dynamic from "next/dynamic";

/** WebGL only exists in the browser, so the bench is never server-rendered. */
export const So101BenchLoader = dynamic(() => import("@/components/so101-bench").then((m) => m.So101Bench), {
  ssr: false,
  loading: () => <div className="h-[420px] animate-pulse bg-ink-2" />,
});
