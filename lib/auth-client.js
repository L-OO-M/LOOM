import { createClient } from "@/lib/supabase/client";

export async function signIn(email, password) {
  const supabase = createClient();
  // Do NOT add a post-sign-in `getSession()` assertion here. It was added to
  // "wait for the cookie write", but it reports a false failure: with
  // @supabase/ssr the browser client may not have a readable session at this
  // point in the flow even though sign-in fully succeeded. That check turned
  // every successful login into a spurious error and locked users out.
  //
  // Persistence is handled where it actually belongs: middleware.js refreshes
  // the session and writes the cookies onto the response (see the comment
  // there). By the time the browser requests the next page, the server has
  // already persisted a valid session.
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
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