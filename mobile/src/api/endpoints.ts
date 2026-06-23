import { apiRequest } from "./client";
import type {
  Contact,
  Group,
  Profile,
  ReleaseTarget,
  Template,
  UserSettings,
  WaSession,
} from "../types";

export const api = {
  getProfile: () => apiRequest<Profile>("/api/profile"),
  updateProfile: (displayName: string) =>
    apiRequest<{ ok: boolean }>("/api/profile", {
      method: "PUT",
      body: JSON.stringify({ displayName }),
    }),

  changePassword: (current: string, newPassword: string) =>
    apiRequest<{ ok: boolean }>("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ current, new: newPassword }),
    }),

  getGroups: () => apiRequest<Group[]>("/api/groups"),
  createGroup: (group: Partial<Group>) =>
    apiRequest<{ ok: boolean }>("/api/groups", {
      method: "POST",
      body: JSON.stringify(group),
    }),
  updateGroup: (idx: number, group: Partial<Group>) =>
    apiRequest<{ ok: boolean }>(`/api/groups/${idx}`, {
      method: "PUT",
      body: JSON.stringify(group),
    }),
  deleteGroup: (idx: number) =>
    apiRequest<{ ok: boolean }>(`/api/groups/${idx}`, { method: "DELETE" }),
  saveAllGroups: (groups: Group[]) =>
    apiRequest<{ ok: boolean }>("/api/groups", {
      method: "PUT",
      body: JSON.stringify({ groups }),
    }),

  getTemplates: () => apiRequest<Template[]>("/api/templates"),
  createTemplate: (name: string, content: string) =>
    apiRequest<{ ok: boolean }>("/api/templates", {
      method: "POST",
      body: JSON.stringify({ name, content }),
    }),
  updateTemplate: (idx: number, name: string, content: string) =>
    apiRequest<{ ok: boolean }>(`/api/templates/${idx}`, {
      method: "PUT",
      body: JSON.stringify({ name, content }),
    }),
  deleteTemplate: (idx: number) =>
    apiRequest<{ ok: boolean }>(`/api/templates/${idx}`, { method: "DELETE" }),

  getContacts: () => apiRequest<Contact[]>("/api/contacts"),
  createContact: (contact: Partial<Contact>) =>
    apiRequest<{ ok: boolean }>("/api/contacts", {
      method: "POST",
      body: JSON.stringify(contact),
    }),
  updateContact: (idx: number, contact: Partial<Contact>) =>
    apiRequest<{ ok: boolean }>(`/api/contacts/${idx}`, {
      method: "PUT",
      body: JSON.stringify(contact),
    }),
  deleteContact: (idx: number) =>
    apiRequest<{ ok: boolean }>(`/api/contacts/${idx}`, { method: "DELETE" }),

  getSettings: () => apiRequest<UserSettings>("/api/settings"),
  updateSettings: (data: { delaySeconds?: number; headless?: boolean }) =>
    apiRequest<UserSettings>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  getAudit: () =>
    apiRequest<{ action: string; detail: string; ip: string; at: string }[]>("/api/audit"),

  getConfig: () =>
    apiRequest<{
      groups: Group[];
      templates: Template[];
      contacts: Contact[];
      settings: UserSettings;
    }>("/api/config"),

  restoreConfig: (config: object) =>
    apiRequest<{ ok: boolean }>("/api/config", {
      method: "PUT",
      body: JSON.stringify(config),
    }),

  waSession: () => apiRequest<WaSession>("/api/whatsapp/session"),
  waStart: () =>
    apiRequest<WaSession>("/api/whatsapp/session/start", { method: "POST", body: "{}" }),
  waReset: () =>
    apiRequest<WaSession>("/api/whatsapp/session/reset", { method: "POST", body: "{}" }),
  waStop: () =>
    apiRequest<{ ok: boolean }>("/api/whatsapp/session/stop", { method: "POST", body: "{}" }),
  waQr: () =>
    apiRequest<{ format: string; data: string; connected?: boolean; error?: string }>(
      "/api/whatsapp/session/qr"
    ),
  waStatus: () =>
    apiRequest<{ sessionCached: boolean; provider: string; detail?: string }>(
      "/api/whatsapp/status"
    ),
  directLog: (name: string, type: "group" | "contact") =>
    apiRequest<{ ok: boolean }>("/api/whatsapp/direct-log", {
      method: "POST",
      body: JSON.stringify({ name, type }),
    }),

  release: (targets: ReleaseTarget[]) =>
    apiRequest<{ ok: boolean }>("/api/release", {
      method: "POST",
      body: JSON.stringify({ targets }),
    }),

  releasePreflight: (targets: ReleaseTarget[]) =>
    apiRequest<{ ready: boolean; checks: { id: string; label: string; ok: boolean; hint?: string }[] }>(
      "/api/release/preflight",
      { method: "POST", body: JSON.stringify({ targets }) }
    ),

  releaseHistory: (limit = 50) =>
    apiRequest<{
      total: number;
      items: {
        id: number;
        targetName: string;
        targetType: string;
        status: string;
        detail: string;
        at: string;
      }[];
    }>(`/api/release-history?limit=${limit}`),

  releaseRetry: (id: number) =>
    apiRequest<{ ok: boolean }>("/api/release/retry", {
      method: "POST",
      body: JSON.stringify({ id }),
    }),

  waGroups: () => apiRequest<{ groups: { id: string; name: string }[] }>("/api/whatsapp/groups"),

  validateGroupNames: (names: string[]) =>
    apiRequest<{
      validation: Record<string, { ok: boolean | null; match?: string; similar?: string[]; note?: string; error?: string }>;
    }>("/api/whatsapp/groups/validate", {
      method: "POST",
      body: JSON.stringify({ names }),
    }),

  getScheduledJob: () =>
    apiRequest<{ enabled: boolean; dow: number; hour: number; minute: number; lastRunAt: string | null }>(
      "/api/scheduled-job"
    ),

  saveScheduledJob: (data: { enabled: boolean; dow: number; hour: number; minute: number }) =>
    apiRequest<{ ok: boolean }>("/api/scheduled-job", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
};
