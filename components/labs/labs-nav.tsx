"use client";

import Link from "next/link";
import { usePath } from "@/lib/use-path";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { ThenarWordmark } from "@/components/brand";
import { APP_HOME, GITHUB } from "@/lib/site";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/products", label: "Products" },
  { href: APP_HOME, label: "Thenar app" },
  { href: GITHUB, label: "GitHub", external: true },
];

/**
 * The company's nav: a floating glass pill, the wordmark on the left, four
 * links in the middle, one lilac action on the right.
 */
export function LabsNav() {
  const pathname = usePath();
  const [open, setOpen] = useState(false);
  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4">
      <nav
        aria-label="ThenarLabs"
        className="glass mx-auto flex h-14 backdrop-blur-xl backdrop-saturate-150 max-w-[1100px] items-center justify-between gap-4 rounded-2xl px-4 sm:px-5"
      >
        <Link href="/" className="flex items-center gap-3" aria-label="ThenarLabs home">
          <ThenarWordmark labs />
          <span className="hidden rounded-full border border-white/10 px-2 py-0.5 text-xs text-scribe-3 md:inline">Physical AI lab</span>
        </Link>
        <ul className="hidden items-center gap-1 sm:flex">
          {LINKS.map((l) => {
            const active = !l.external && pathname === l.href;
            return (
              <li key={l.label}>
                <Link
                  href={l.href}
                  target={l.external ? "_blank" : undefined}
                  rel={l.external ? "noreferrer" : undefined}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm transition-colors duration-300",
                    active ? "text-white" : "text-scribe-2 hover:text-white",
                  )}
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-2">
          <Link
            href={APP_HOME}
            className="whitespace-nowrap rounded-lg bg-lilac px-3 py-2 text-sm font-semibold text-black transition duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white active:scale-[0.98] sm:px-4"
          >
            Open the app
          </Link>
          <button
            type="button"
            aria-label={open ? "Close the menu" : "Open the menu"}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="relative size-9 sm:hidden"
          >
            <span className={cn("absolute left-2 right-2 h-px bg-white transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]", open ? "top-1/2 rotate-45" : "top-[14px]")} />
            <span className={cn("absolute left-2 right-2 h-px bg-white transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]", open ? "top-1/2 -rotate-45" : "top-[22px]")} />
          </button>
        </div>
      </nav>
      {open ? (
        <div className="fixed inset-0 -z-10 bg-black/80 backdrop-blur-3xl sm:hidden" onClick={() => setOpen(false)}>
          <ul className="flex flex-col gap-2 px-8 pt-28">
            {LINKS.map((l, i) => (
              <li key={l.label} className="animate-[labs-rise_700ms_cubic-bezier(0.32,0.72,0,1)_both]" style={{ animationDelay: `${100 + i * 50}ms` }}>
                <Link href={l.href} className="block py-2 text-3xl text-white" onClick={() => setOpen(false)}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </header>
  );
}
