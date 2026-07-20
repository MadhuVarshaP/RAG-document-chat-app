import { cookies } from "next/headers";
import { randomUUID } from "crypto";

const COOKIE_NAME = "session_id";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

// Anonymous, per-browser privacy scoping — no login/signup. Reads the
// session cookie if the browser already has one; otherwise mints a new
// UUID and sets it (HTTP-only, so client JS can't read or forge it).
// Must be called from a Route Handler, not a Server Component render,
// since only Route Handlers can set outgoing cookies.
export async function getOrCreateSessionId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE_NAME)?.value;
  if (existing) return existing;

  const id = randomUUID();
  store.set(COOKIE_NAME, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return id;
}
