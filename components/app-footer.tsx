"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { usePath } from "@/lib/use-path";
import { singleOriginHost } from "@/lib/site";
import { useLabsHome } from "@/components/labs/labs-home";

/**
 * Everything the menus no longer carry, one click away.
 *
 * The primary menus hold what a visitor comes for: earning, the data, the
 * protocol. The rest (the object library, the live floor, the labs' budgets,
 * the archive of earlier chains, the handheld recorder, policies, the
 * changelog) is real and stays reachable, but it is not a first-five-minutes
 * page, so it lives here instead of competing in the menus.
 */
const MORE = [
  { href: "/inventory", label: "Object library" },
  { href: "/space", label: "Live floor" },
  { href: "/lab", label: "Labs" },
  { href: "/policies", label: "Policies" },
  { href: "/handheld", label: "Handheld recorder" },
  { href: "/archive", label: "Archive" },
  { href: "/changelog", label: "Changelog" },
  { href: "/status", label: "Status" },
];

const noop = () => () => {};
const appHost = () => location.host.startsWith("app.") || singleOriginHost(location.host);

export function AppFooter() {
  const pathname = usePath();
  const labsHome = useLabsHome();
  // On thenar.io, "/" is the company's home, which has its own footer.
  const onApp = useSyncExternalStore(noop, appHost, () => true);
  const company = pathname === "/labs" || pathname.startsWith("/products") || (pathname === "/" && !onApp);
  if (company || pathname.startsWith("/station/")) return null;
  return (
    <footer className="mx-auto mt-16 max-w-[1100px] border-t border-white/10 px-5 py-6" data-testid="app-footer">
      <nav aria-label="More from Thenar" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-scribe-3">
        <span className="text-scribe-2">More</span>
        {MORE.map((m) => (
          <Link key={m.href} href={m.href} className="transition-colors hover:text-white" aria-current={pathname === m.href ? "page" : undefined}>
            {m.label}
          </Link>
        ))}
        <Link href={labsHome} className="ml-auto transition-colors hover:text-white">ThenarLabs &rarr;</Link>
      </nav>
    </footer>
  );
}
