import { NextResponse } from "next/server";

import { GOOGLE_TOKEN_COOKIE } from "@/lib/google/oauth";

// Called during logout to clear the Google session cookie from the browser.
// Does not touch the DB — only removes the httpOnly browser cookie.
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(GOOGLE_TOKEN_COOKIE);
  return response;
}
