import Link from "next/link";
import { ThenarWordmark } from "@/components/brand";
import { APP_HOME, GITHUB, appHref } from "@/lib/site";

const COLUMNS = [
  {
    title: "Company",
    links: [
      { href: "/", label: "Home" },
      { href: "/products", label: "Products" },
      { href: GITHUB, label: "GitHub", external: true },
    ],
  },
  {
    title: "Thenar",
    links: [
      { href: APP_HOME, label: "Open the app" },
      { href: appHref("/hub"), label: "Find a task" },
      { href: appHref("/agents"), label: "For AI agents" },
      { href: appHref("/contracts"), label: "Contracts on Monad" },
    ],
  },
  {
    title: "Hardware",
    links: [
      { href: "https://github.com/nickthelegend/thenar-arms", label: "Thenar Arms", external: true },
      { href: "https://github.com/nickthelegend/thenar-jx1", label: "JX1 and JX0", external: true },
      { href: "https://github.com/nickthelegend/thenar-duck", label: "Thenar Duck", external: true },
    ],
  },
];

export function LabsFooter() {
  return (
    <footer className="border-t border-white/10 px-6 py-16">
      <div className="mx-auto flex max-w-[1200px] flex-wrap justify-between gap-12">
        <div className="max-w-[320px]">
          <ThenarWordmark labs />
          <p className="mt-4 text-sm text-scribe-3">
            A physical AI lab. Robots anyone can build, and the people who teach them, paid for it.
          </p>
        </div>
        <div className="flex flex-wrap gap-16">
          {COLUMNS.map((c) => (
            <div key={c.title}>
              <p className="text-sm text-white">{c.title}</p>
              <ul className="mt-4 flex flex-col gap-3">
                {c.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      target={"external" in l && l.external ? "_blank" : undefined}
                      rel={"external" in l && l.external ? "noreferrer" : undefined}
                      className="text-sm text-scribe-3 transition-colors hover:text-white"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <p className="mx-auto mt-16 max-w-[1200px] text-xs text-scribe-3">
        © 2026 ThenarLabs. Built on Monad. The hero film was made with Google Veo, and the glass renders with ChatGPT.
      </p>
    </footer>
  );
}
