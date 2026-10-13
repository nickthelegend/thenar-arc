"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { singleOriginHost } from "@/lib/site";

/**
 * Where the company's home is, from wherever this page is served.
 *
 * On thenar.io it is "/". On a host that serves the app and the company from
 * one origin (a local build), "/" is the app's front door, so the company's
 * home is /labs (proxy.ts). Read after hydration; the server answers "/".
 */
const noop = () => () => {};
export const useLabsHome = () =>
  useSyncExternalStore(noop, () => (singleOriginHost(location.host) ? "/labs" : "/"), () => "/");

export function LabsHomeLink(props: Omit<React.ComponentProps<typeof Link>, "href">) {
  return <Link href={useLabsHome()} {...props} />;
}
