import type { Ionicons } from "@expo/vector-icons";

export type NavItem = {
  label: string;
  shortLabel: string;
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Groups", shortLabel: "Groups", href: "/(drawer)/groups", icon: "people-outline" },
  { label: "Schedule", shortLabel: "Schedule", href: "/(drawer)/schedule", icon: "calendar-outline" },
  { label: "Open in WhatsApp", shortLabel: "Open WA", href: "/(drawer)/open-wa", icon: "open-outline" },
  { label: "Automated Send", shortLabel: "Send", href: "/(drawer)/send", icon: "chatbubble-ellipses-outline" },
  { label: "Templates", shortLabel: "Templates", href: "/(drawer)/templates", icon: "document-text-outline" },
  { label: "Contacts", shortLabel: "Contacts", href: "/(drawer)/contacts", icon: "person-outline" },
  { label: "Settings", shortLabel: "Settings", href: "/(drawer)/settings", icon: "settings-outline" },
  { label: "Profile", shortLabel: "Profile", href: "/(drawer)/profile", icon: "person-circle-outline" },
];
