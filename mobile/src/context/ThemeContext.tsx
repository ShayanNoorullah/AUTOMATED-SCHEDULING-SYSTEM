import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Appearance } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { applyTheme, type Scheme } from "../theme";

export type ThemeMode = "light" | "dark" | "system";
const STORAGE_KEY = "themeMode";

function resolve(mode: ThemeMode): Scheme {
  if (mode === "system") return (Appearance.getColorScheme() === "dark" ? "dark" : "light");
  return mode;
}

type Ctx = { mode: ThemeMode; scheme: Scheme; setMode: (m: ThemeMode) => void };
const ThemeCtx = createContext<Ctx>({ mode: "system", scheme: "light", setMode: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [scheme, setScheme] = useState<Scheme>(resolve("system"));

  // Apply synchronously so the first paint is already themed
  applyTheme(scheme);

  // Load saved preference once
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === "light" || saved === "dark" || saved === "system") {
        setModeState(saved);
        setScheme(resolve(saved));
      }
    });
  }, []);

  // Follow OS changes while in "system" mode
  useEffect(() => {
    const sub = Appearance.addChangeListener(() => {
      if (mode === "system") setScheme(resolve("system"));
    });
    return () => sub.remove();
  }, [mode]);

  function setMode(m: ThemeMode) {
    setModeState(m);
    setScheme(resolve(m));
    AsyncStorage.setItem(STORAGE_KEY, m);
  }

  const value = useMemo(() => ({ mode, scheme, setMode }), [mode, scheme]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}
