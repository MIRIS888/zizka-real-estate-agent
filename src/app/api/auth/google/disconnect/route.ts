import { NextResponse } from "next/server";

import {
  disconnectGoogleAccount,
  GOOGLE_TOKEN_COOKIE,
} from "@/lib/google/oauth";

export function POST() {
  disconnectGoogleAccount();
  const response = NextResponse.json({ connected: false });
  response.cookies.delete(GOOGLE_TOKEN_COOKIE);

  return response;
}
