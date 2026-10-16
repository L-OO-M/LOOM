import { createClient } from "@/lib/supabase/client";

export async function signIn(email, password) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  // signInWithPassword resolves once tokens are in hand, but the browser
  // client's cookie write is what makes the session outlive the tab. Wait for
  // it, so a redirect that immediately follows cannot race the write and leave
  // the next request without a session cookie.
  if (!error) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { data, error: { message: "Sign in did not produce a session" } };
    } catch {
      // Fall through: the token exchange succeeded, so let the caller proceed.
    }
  }
  return { data, error };
}

export async function signUp(email, password, metadata) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: metadata }
  });
  return { data, error };
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
}