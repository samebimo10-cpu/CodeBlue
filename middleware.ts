import { NextResponse, type NextRequest } from "next/server";

/**
 * Password protection for a public deployment. Set CODEBLUE_PASSWORD (and
 * optionally CODEBLUE_USER, default "admin") and the browser asks for them.
 * Without CODEBLUE_PASSWORD the app is open, which is fine on your own machine.
 */
export function middleware(req: NextRequest) {
  const password = process.env.CODEBLUE_PASSWORD;
  if (!password || req.nextUrl.pathname === "/api/health") return NextResponse.next();
  const user = process.env.CODEBLUE_USER || "admin";
  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const [u, ...rest] = atob(header.slice(6)).split(":");
      if (u === user && rest.join(":") === password) return NextResponse.next();
    } catch {}
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Code Blue", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|manifest.webmanifest).*)"],
};
