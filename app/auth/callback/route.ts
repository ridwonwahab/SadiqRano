import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const providerError = request.nextUrl.searchParams.get("error");
  const requestedNext = request.nextUrl.searchParams.get("next");
  const next =
    typeof requestedNext === "string" &&
    requestedNext.startsWith("/") &&
    !requestedNext.startsWith("//") &&
    !requestedNext.includes("\\")
      ? requestedNext
      : "/";

  if (providerError) {
    console.error("Google sign-in provider error:", providerError);
    return NextResponse.redirect(new URL("/auth/error", request.url));
  }

  if (code) {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("Google sign-in callback failed:", error.message);
      return NextResponse.redirect(new URL("/auth/error", request.url));
    }
  }

  return NextResponse.redirect(new URL(next, request.url));
}
