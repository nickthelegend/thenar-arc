"use client";

import { usePathname } from "next/navigation";

/**
 * The path the visitor is on, as they would write it.
 *
 * A page prerendered for "/" on Vercel hydrates with its route path as
 * "/index", so usePathname() answers "/index" on the company home until the
 * first client navigation. Everything that asks "is this the home page?" then
 * says no: the app's nav drew itself under the company's, and the home's page
 * views were reported as a path the counter does not know.
 */
export function usePath(): string {
  const p = usePathname() ?? "/";
  if (p === "/index") return "/";
  return p.endsWith("/index") ? p.slice(0, -"/index".length) : p;
}
