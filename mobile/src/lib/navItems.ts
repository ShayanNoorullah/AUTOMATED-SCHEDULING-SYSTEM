import type { Ionicons } from "@expo/vector-icons";

export type NavItem = {
  label: string;
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Groups", href: "/(drawer)/groups", icon: "people-outline" },
  { label: "Schedule", href: "/(drawer)/schedule", icon: "calendar-outline" },
  { label: "Open in WhatsApp", href: "/(drawer)/open-wa", icon: "open-outline" },
  { label: "Automated Send", href: "/(drawer)/send", icon: "chatbubble-ellipses-outline" },
  { label: "Templates", href: "/(drawer)/templates", icon: "document-text-outline" },
  { label: "Contacts", href: "/(drawer)/contacts", icon: "person-outline" },
  { label: "Settings", href: "/(drawer)/settings", icon: "settings-outline" },
  { label: "Profile", href: "/(drawer)/profile", icon: "person-circle-outline" },
];
