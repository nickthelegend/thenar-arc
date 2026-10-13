/**
 * Where the two sites live.
 *
 * thenar.io is ThenarLabs: the company and everything it builds. The Thenar
 * app (tasks, the station, the data) lives on app.thenar.io once
 * NEXT_PUBLIC_APP_ORIGIN names it; until then, and on any local build, it is
 * served from this same origin with its home at /thenar.
 */
export const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_ORIGIN ?? "").replace(/\/$/, "");

/** A path in the app, as a link from anywhere. */
export const appHref = (path: string) => (APP_ORIGIN ? `${APP_ORIGIN}${path}` : path === "/" ? "/thenar" : path);

export const APP_HOME = appHref("/");

/** The company site's own origin, for links back from the app. */
export const LABS_ORIGIN = (process.env.NEXT_PUBLIC_LABS_ORIGIN ?? "").replace(/\/$/, "");
export const labsHref = (path: string) => (LABS_ORIGIN ? `${LABS_ORIGIN}${path}` : path);

export const GITHUB = "https://github.com/nickthelegend";

/**
 * A host that serves the app and the company from one origin: this machine, a
 * preview or any host that is neither thenar.io (the company) nor app.* (the
 * app). There "/" is the app's front door and the company's home is /labs, so
 * a judge who opens the build lands on the product (proxy.ts).
 */
export const singleOriginHost = (host: string) =>
  !/^(www\.)?thenar\.io(:\d+)?$/i.test(host) && !host.toLowerCase().startsWith("app.");
