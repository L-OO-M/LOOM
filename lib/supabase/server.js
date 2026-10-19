import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              // Preserve Supabase's own cookie options -- in particular maxAge,
              // which is what makes the session survive the browser closing.
              // Overriding it (or leaving these to a bare { sameSite }) is what
              // turns a persistent session into a session cookie that dies with
              // the tab.
              cookieStore.set(name, value, {
                ...options,
                // "lax", matching @supabase/ssr's default. "strict" withheld the
                // cookie on cross-site navigations (a bookmark, a shared link,
                // a redirect back from Supabase), which surfaced to users as
                // being logged out.
                sameSite: "lax",
                secure: process.env.NODE_ENV === "production",
                httpOnly: true,
                path: "/"
              })
            );
          } catch {
            // Cookies can only be modified in Server Action/Route Handler with
            // mutable context. API routes that only read session can safely
            // ignore the refresh write -- middleware.js performs the refresh
            // and sets the cookies on the response, which is what persists them.
          }
        }
      }
    }
  );
}

export async function createServiceRoleSupabase() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}