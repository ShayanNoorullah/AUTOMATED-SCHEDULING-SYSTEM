import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "./ThemeContext";
import { applyTheme, DEFAULT_PREFS, type ThemePrefs } from "../theme";

const STORAGE_KEY = "ssies_prefs";

export type FontSize = "small" | "medium" | "large";
export type CornerRadius = "sharp" | "rounded" | "pill";
export type UiDensity = "compact" | "comfortable" | "spacious";
export type DefaultPage = "groups" | "schedule" | "contacts" | "send";
export type NavIconStyle = "outline" | "filled";
export type DefaultSendMode = "ask" | "direct" | "automated";
export type StatusLogPref = "auto" | "always" | "never";
export type TableZebra = "on" | "off";

export type Preferences = ThemePrefs & {
  defaultPage: DefaultPage;
  tableZebra: TableZebra;
  navIconStyle: NavIconStyle;
  defaultSendMode: DefaultSendMode;
  statusLog: StatusLogPref;
};

export const DEFAULT_PREFERENCES: Preferences = {
  ...DEFAULT_PREFS,
  defaultPage: "groups",
  tableZebra: "off",
  navIconStyle: "outline",
  defaultSendMode: "ask",
  statusLog: "auto",
};

type Ctx = {
  prefs: Preferences;
  setPref: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  ready: boolean;
};

const PrefsCtx = createContext<Ctx>({
  prefs: DEFAULT_PREFERENCES,
  setPref: () => {},
  ready: false,
});

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { scheme } = useTheme();
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          setPrefs({ ...DEFAULT_PREFERENCES, ...JSON.parse(raw) });
        } catch {
          /* ignore */
        }
      }
      setReady(true);
    });
  }, []);

  useEffect(() => {
    applyTheme(scheme, prefs);
  }, [scheme, prefs]);

  const setPref = useCallback(<K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const value = useMemo(() => ({ prefs, setPref, ready }), [prefs, setPref, ready]);
  return <PrefsCtx.Provider value={value}>{children}</PrefsCtx.Provider>;
}

export function usePreferences() {
  return useContext(PrefsCtx);
}

import type { Ionicons } from "@expo/vector-icons";

/** Map outline drawer icons to filled variants when user prefers filled nav. */
export function resolveNavIcon(
  outline: keyof typeof Ionicons.glyphMap,
  style: NavIconStyle
): keyof typeof Ionicons.glyphMap {
  if (style === "outline") return outline;
  const map: Partial<Record<keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap>> = {
    "people-outline": "people",
    "calendar-outline": "calendar",
    "open-outline": "open",
    "chatbubble-ellipses-outline": "chatbubble-ellipses",
    "document-text-outline": "document-text",
    "person-outline": "person",
    "settings-outline": "settings",
    "person-circle-outline": "person-circle",
  };
  return map[outline] ?? outline;
}

export const DEFAULT_PAGE_ROUTES: Record<DefaultPage, string> = {
  groups: "/(drawer)/groups",
  schedule: "/(drawer)/schedule",
  contacts: "/(drawer)/contacts",
  send: "/(drawer)/send",
};

export const ACCENT_SWATCHES = [
  "#4F46E5",
  "#0000EE",
  "#2563EB",
  "#0891B2",
  "#059669",
  "#D97706",
  "#DC2626",
  "#7C3AED",
];
