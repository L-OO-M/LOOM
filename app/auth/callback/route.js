import { createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getRequestContext } from "@/lib/auth-server";
import { homeForRole } from "@/lib/auth";

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Role-aware landing (falls back to /student for brand-new profiles).
      try {
        const ctx = await getRequestContext();
        if (!ctx.error && ctx.profile) {
          return NextResponse.redirect(`${origin}${homeForRole(ctx.profile.role)}`);
        }
      } catch { /* fall through to default */ }
      return NextResponse.redirect(`${origin}/student`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
