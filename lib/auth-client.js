import { createClient } from "@/lib/supabase/client";
import { validatePassword } from "@/lib/password";

export async function signIn(email, password) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { data, error };
}

export async function signUp(email, password, metadata) {
  const pwCheck = validatePassword(password);
  if (!pwCheck.ok) {
    return { data: null, error: { message: pwCheck.message } };
  }
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