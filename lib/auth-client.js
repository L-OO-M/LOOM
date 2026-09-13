import { createClient } from "@/lib/supabase/client";

export async function signIn(email, password) {
  const supabase = createClient();
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