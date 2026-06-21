import type { Contact, Group } from "../types";
import { messageFor, replaceTokens } from "./messageTokens";

export function buildContactUrl(phone: string, message: string): string {
  const p = String(phone || "").replace(/\D/g, "");
  if (!p) return "";
  const text = encodeURIComponent(replaceTokens(message || "").trim());
  return `https://wa.me/${p}` + (text ? `?text=${text}` : "");
}

export function buildGroupDirectUrl(group: Group): string {
  const invite = (group.inviteLink || "").trim();
  return invite || "https://web.whatsapp.com";
}

export function groupMessage(group: Group): string {
  return replaceTokens(messageFor(group));
}

export function contactMessage(contact: Contact): string {
  return replaceTokens(contact.message || "");
}
