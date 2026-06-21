import * as SecureStore from "expo-secure-store";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

const ACCESS_KEY = "ssies_access_token";
const REFRESH_KEY = "ssies_refresh_token";

let supabase: SupabaseClient | null = null;

export function initSupabase(url: string, anonKey: string): SupabaseClient {
  supabase = createClient(url, anonKey, {
    auth: { storage: undefined, autoRefreshToken: false, persistSession: false },
  });
  return supabase;
}

export function getSupabase(): SupabaseClient {
  if (!supabase) throw new Error("Supabase not initialized");
  return supabase;
}

export async function saveTokens(access: string, refresh: string): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_KEY, access);
  await SecureStore.setItemAsync(REFRESH_KEY, refresh);
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_KEY);
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

export async function refreshAccessToken(): Promise<string | null> {
  const refresh = await getRefreshToken();
  if (!refresh || !supabase) return null;
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refresh });
  if (error || !data.session) return null;
  await saveTokens(data.session.access_token, data.session.refresh_token);
  return data.session.access_token;
}

export async function signIn(
  email: string,
  password: string
): Promise<{ session: Session; error?: string }> {
  const sb = getSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    return { session: null as unknown as Session, error: error?.message || "Login failed" };
  }
  await saveTokens(data.session.access_token, data.session.refresh_token);
  return { session: data.session };
}
