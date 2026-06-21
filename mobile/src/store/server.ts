import AsyncStorage from "@react-native-async-storage/async-storage";

const SERVER_KEY = "ssies_server_url";

export async function getServerUrl(): Promise<string | null> {
  return AsyncStorage.getItem(SERVER_KEY);
}

export async function setServerUrl(url: string): Promise<void> {
  const normalized = url.trim().replace(/\/+$/, "");
  await AsyncStorage.setItem(SERVER_KEY, normalized);
}

export async function clearServerUrl(): Promise<void> {
  await AsyncStorage.removeItem(SERVER_KEY);
}

export async function testServerHealth(baseUrl: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`${baseUrl.replace(/\/+$/, "")}/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!r.ok) return { ok: false, error: `Server returned ${r.status}` };
    const data = await r.json();
    if (!data.database) return { ok: false, error: "Database not connected on server" };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Cannot reach server" };
  }
}

export type MobileConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  siteName: string;
};

export async function fetchMobileConfig(baseUrl: string): Promise<MobileConfig | null> {
  try {
    const r = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/mobile/config`);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}
