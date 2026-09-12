"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Switch the instrument between the lamp and the dark.
 *
 * Paper is the default now and ink is the choice — the reverse of what this
 * shipped with. The landing page commits to a light achromatic world, and a
 * visitor who presses "Find a task" should not have the world invert
 * underneath them; a product with two grounds has to pick the one its front
 * door is painted in.
 *
 * It still does not follow the operating system. A system preference nobody
 * set for this site is not a decision about this site, and silently rendering
 * the whole instrument inverted on the strength of it would be a surprise
 * rather than a courtesy. The choice is remembered once it is made.
 *
 * The attribute is written by a script in the document head as well as here.
 * Doing it only in React means the first paint is the default theme and the
 * chosen one arrives a frame later, which is the flash every themed site has
 * to decide not to ship.
 */
export const THEME_KEY = "thenar.theme";

/** How long the ground takes to cross over. Matched in globals.css. */
const GROUND_MS = 260;

export function ThemeToggle() {
  // Null until mounted: the server has no way to know what was stored, and
  // rendering a guess would make the button's own state the thing that flashes.
  const [theme, setTheme] = useState<"dark" | "light" | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const set = (next: "dark" | "light") => {
    setTheme(next);
    /**
     * Let the ground travel, for exactly as long as it takes.
     *
     * The instrument inverts on a single click — every surface, every rule,
     * every figure at once — and a hard swap of that much area reads as a
     * glitch rather than a decision. A short cross-fade of the two colours
     * that actually carry the world says the same thing and says that it was
     * deliberate.
     *
     * Switched on only for the press, and off again once it lands. A standing
     * transition on `background-color` would also catch every hover, every
     * focus ring and every panel that changes tone mid-interaction, and make
     * the whole interface feel like it is lagging behind the pointer.
     */
    const root = document.documentElement;
    root.dataset.themeShifting = "";
    window.setTimeout(() => delete root.dataset.themeShifting, GROUND_MS);
    root.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // A browser with storage blocked still gets the switch, just not the memory.
    }
  };

  return (
    <button
      type="button"
      onClick={() => set(theme === "light" ? "dark" : "light")}
      aria-label={theme === "light" ? "Switch to the dark theme" : "Switch to the light theme"}
      title={theme === "light" ? "Dark" : "Light"}
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center border border-rule",
        "text-scribe-3 transition-colors hover:border-rule-strong hover:text-scribe",
      )}
    >
      {/* A half-filled disc: the same object under two lightings, which is what
          the control actually does. Drawn rather than an emoji so it inherits
          the stroke weight of everything else in the header. */}
      <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
        <circle cx="7" cy="7" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.1" />
        <path d="M7 1.75 A5.25 5.25 0 0 1 7 12.25 Z" fill="currentColor" />
      </svg>
    </button>
  );
}

/**
 * Applied before the first paint, from the document head.
 *
 * Inlined as a string because it has to run before React exists. It reads the
 * stored choice and writes the attribute; anything it throws is swallowed,
 * because a browser with storage disabled should get the default theme rather
 * than a blank page.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t==="dark")document.documentElement.dataset.theme="dark"}catch(e){}})()`;
