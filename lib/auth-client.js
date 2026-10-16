import { createClient } from "@/lib/supabase/client";

export async function signIn(email, password) {
  // Goes through /api/auth/login rather than calling the auth server from the
  // browser. A direct browser call bypasses this app's rate limiter entirely,
  // which is how unlimited credential guessing used to reach the auth server.
  //
  // The server proxy performs the same credential exchange under the hood, so
  // the credentials and session handling are unchanged.
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!data.ok) {
      return { data: null, error: { message: data.error?.message || "Sign in failed" } };
    }
    return { data: { user: data.data?.user ?? null }, error: null };
  } catch {
    return { data: null, error: { message: "Couldn't reach the server. Try again." } };
  }
}

export async function signUp(email, password, metadata) {
  // Same reasoning as signIn: routed server-side so signup is rate limited.
  try {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, metadata })
    });
    const data = await res.json();
    if (!data.ok) {
      return { data: null, error: { message: data.error?.message || "Registration failed" } };
    }
    return { data: { user: data.data?.user ?? null, session: data.data?.session }, error: null };
  } catch {
    return { data: null, error: { message: "Couldn't reach the server. Try again." } };
  }
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
}