import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  decodeGoogleToken,
  getGoogleConnectionStatus,
  GOOGLE_TOKEN_COOKIE,
} from "@/lib/google/oauth";

export async function GET() {
  const cookieStore = await cookies();
  const token = decodeGoogleToken(cookieStore.get(GOOGLE_TOKEN_COOKIE)?.value);

  return NextResponse.json(getGoogleConnectionStatus(token));
}
