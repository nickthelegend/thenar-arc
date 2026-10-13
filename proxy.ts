import { NextResponse, type NextRequest } from "next/server";
import { singleOriginHost } from "@/lib/site";

/**
 * Two sites from one build.
 *
 * thenar.io is ThenarLabs, the company: its home and /products. app.thenar.io
 * is the Thenar app. On an app host the root is the app's home (/thenar); on
 * the company host the app's pages move to the app host once
 * NEXT_PUBLIC_APP_ORIGIN names it, so an old link to thenar.io/hub still lands
 * on the task list.
 *
 * On a host that serves both from one origin (this machine: `pnpm demo`), the
 * app is the front door too: "/" is the app's home and the company's home is
 * /labs (app/labs/page.tsx). A judge's first page is the product, not the company.
 */
const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_ORIGIN ?? "").replace(/\/$/, "");

/** The company site's own pages. Everything else is the app's. */
const LABS = /^\/((products|labs)(\/.*)?)?$/;

export function proxy(req: NextRequest) {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").toLowerCase();
  const { pathname, search } = req.nextUrl;

  if (singleOriginHost(host)) {
    if (pathname === "/") return NextResponse.rewrite(new URL(`/thenar${search}`, req.url));
    return NextResponse.next();
  }

  if (host.startsWith("app.")) {
    if (pathname === "/") return NextResponse.rewrite(new URL(`/thenar${search}`, req.url));
    // The company's pages live on the company host.
    if (LABS.test(pathname) && pathname !== "/") {
      return NextResponse.redirect(new URL(`https://${host.slice(4)}${pathname}${search}`), 308);
    }
    return NextResponse.next();
  }

  if (APP_ORIGIN && !LABS.test(pathname) && (host === "thenar.io" || host === "www.thenar.io")) {
    const to = pathname === "/thenar" ? "/" : pathname;
    return NextResponse.redirect(new URL(`${APP_ORIGIN}${to}${search}`), 308);
  }
  return NextResponse.next();
}

export const config = {
  // Pages only: never the API (rewritten to the backend), Next's own files,
  // or anything with a file extension (models, images, the manifest).
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
