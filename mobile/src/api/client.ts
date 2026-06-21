import { getAccessToken, refreshAccessToken } from "../store/auth";
import { getServerUrl } from "../store/server";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function resolveToken(): Promise<string> {
  let token = await getAccessToken();
  if (token) return token;
  token = await refreshAccessToken();
  if (!token) throw new ApiError("Not signed in", 401);
  return token;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  const base = await getServerUrl();
  if (!base) throw new ApiError("Server URL not configured", 0);

  const token = await resolveToken();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  headers.Authorization = `Bearer ${token}`;

  const r = await fetch(`${base}${path}`, { ...options, headers });

  if (r.status === 401 && retry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return apiRequest<T>(path, options, false);
    throw new ApiError("Session expired — sign in again", 401);
  }

  const text = await r.text();
  let data: T & { error?: string };
  try {
    data = text ? JSON.parse(text) : ({} as T);
  } catch {
    throw new ApiError(text || `HTTP ${r.status}`, r.status);
  }

  if (!r.ok) {
    throw new ApiError(data?.error || text || `HTTP ${r.status}`, r.status);
  }
  return data;
}

export async function registerSession(accessToken: string, refreshToken: string): Promise<void> {
  const base = await getServerUrl();
  if (!base) return;
  await fetch(`${base}/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }),
  });
}
