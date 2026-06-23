import { StyleSheet, Platform } from "react-native";

/* ============================================================================
 * SSIES Schedule Sender — Design System (light + dark, runtime-switchable)
 *
 * `colors` and `styles` are LIVE bindings: applyScheme() swaps them and any
 * component re-rendered by ThemeProvider picks up the new values automatically.
 * Every previously exported name still exists (backward compatible).
 * ==========================================================================*/

export type Scheme = "light" | "dark";

export const lightColors = {
  accent: "#0000EE", accentHover: "#0000C4", accentDeep: "#000099",
  accentSoft: "rgba(0,0,238,0.10)", accentBorder: "rgba(0,0,238,0.22)",
  bg: "#F6F7FB", bgElevated: "#FFFFFF", surface: "#FFFFFF", surface2: "#F2F4F9",
  overlay: "rgba(15,23,42,0.45)",
  text: "#0F172A", textSoft: "#475569", muted: "#64748B", faint: "#94A3B8",
  border: "rgba(15,23,42,0.10)", borderStrong: "rgba(15,23,42,0.16)",
  success: "#0E9F6E", successSoft: "rgba(14,159,110,0.12)",
  error: "#E02424", errorSoft: "rgba(224,36,36,0.10)",
  warn: "#C27803", warnSoft: "rgba(194,120,3,0.12)",
  track: "#E2E8F0", white: "#FFFFFF",
};

export const darkColors: typeof lightColors = {
  ...lightColors,
  accent: "#818CF8", accentHover: "#A5B4FC", accentDeep: "#6366F1",
  accentSoft: "rgba(129,140,248,0.16)", accentBorder: "rgba(129,140,248,0.30)",
  bg: "#0B1020", bgElevated: "#141A2C", surface: "#161D31", surface2: "#1C2438",
  overlay: "rgba(0,0,0,0.6)",
  text: "#E8ECF6", textSoft: "#AEB7C7", muted: "#8A95A8", faint: "#5C6679",
  border: "rgba(255,255,255,0.10)", borderStrong: "rgba(255,255,255,0.18)",
  success: "#34D399", successSoft: "rgba(52,211,153,0.16)",
  error: "#F87171", errorSoft: "rgba(248,113,113,0.16)",
  warn: "#FBBF24", warnSoft: "rgba(251,191,36,0.16)",
  track: "#2A344A", white: "#FFFFFF",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export let radii = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };

export type FontSize = "small" | "medium" | "large";
export type CornerRadius = "sharp" | "rounded" | "pill";
export type UiDensity = "compact" | "comfortable" | "spacious";

export type ThemePrefs = {
  accent?: string | null;
  fontSize?: FontSize;
  cornerRadius?: CornerRadius;
  uiDensity?: UiDensity;
};

export const DEFAULT_PREFS: Required<Pick<ThemePrefs, "fontSize" | "cornerRadius" | "uiDensity">> & {
  accent: string | null;
} = {
  accent: null,
  fontSize: "medium",
  cornerRadius: "rounded",
  uiDensity: "comfortable",
};

function fontScale(size: FontSize): number {
  if (size === "small") return 0.92;
  if (size === "large") return 1.08;
  return 1;
}

function radiusScale(r: CornerRadius) {
  if (r === "sharp") return { sm: 4, md: 6, lg: 8, xl: 10, pill: 999 };
  if (r === "pill") return { sm: 12, md: 16, lg: 22, xl: 28, pill: 999 };
  return { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };
}

function densitySpacing(d: UiDensity) {
  if (d === "compact") return { xs: 3, sm: 6, md: 10, lg: 12, xl: 20, xxl: 28 };
  if (d === "spacious") return { xs: 6, sm: 10, md: 14, lg: 20, xl: 28, xxl: 36 };
  return spacing;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function withAccent(base: typeof lightColors, accent: string): typeof lightColors {
  return {
    ...base,
    accent,
    accentSoft: hexToRgba(accent, 0.12),
    accentBorder: hexToRgba(accent, 0.28),
  };
}

export let type = {
  display: { fontSize: 28, fontWeight: "800" as const, lineHeight: 34, letterSpacing: -0.6 },
  h1: { fontSize: 22, fontWeight: "800" as const, lineHeight: 28, letterSpacing: -0.4 },
  h2: { fontSize: 18, fontWeight: "700" as const, lineHeight: 24, letterSpacing: -0.3 },
  h3: { fontSize: 15, fontWeight: "700" as const, lineHeight: 20, letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: "500" as const, lineHeight: 22 },
  bodySoft: { fontSize: 13, fontWeight: "500" as const, lineHeight: 19 },
  caption: { fontSize: 12, fontWeight: "600" as const, lineHeight: 16 },
  mono: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 13, lineHeight: 20,
  },
};

export const pressedOpacity = 0.72;
export const pressedScale = 0.97;

export const elevation = {
  sm: { shadowColor: "#0F172A", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  md: { shadowColor: "#0F172A", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 },
  lg: { shadowColor: "#0F172A", shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.14, shadowRadius: 28, elevation: 8 },
};
export const cardShadow = elevation.md;

export function makeStyles(c: typeof lightColors, prefs: ThemePrefs = DEFAULT_PREFS) {
  const sp = densitySpacing(prefs.uiDensity ?? DEFAULT_PREFS.uiDensity);
  const rad = radiusScale(prefs.cornerRadius ?? DEFAULT_PREFS.cornerRadius);
  const fs = fontScale(prefs.fontSize ?? DEFAULT_PREFS.fontSize);
  const scaledType = {
    display: { ...type.display, fontSize: Math.round(type.display.fontSize * fs), lineHeight: Math.round(type.display.lineHeight * fs) },
    h1: { ...type.h1, fontSize: Math.round(type.h1.fontSize * fs), lineHeight: Math.round(type.h1.lineHeight * fs) },
    h2: { ...type.h2, fontSize: Math.round(type.h2.fontSize * fs), lineHeight: Math.round(type.h2.lineHeight * fs) },
    h3: { ...type.h3, fontSize: Math.round(type.h3.fontSize * fs), lineHeight: Math.round(type.h3.lineHeight * fs) },
    body: { ...type.body, fontSize: Math.round(type.body.fontSize * fs), lineHeight: Math.round(type.body.lineHeight * fs) },
    bodySoft: { ...type.bodySoft, fontSize: Math.round(type.bodySoft.fontSize * fs), lineHeight: Math.round(type.bodySoft.lineHeight * fs) },
    caption: { ...type.caption, fontSize: Math.round(type.caption.fontSize * fs), lineHeight: Math.round(type.caption.lineHeight * fs) },
    mono: type.mono,
  };
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    content: { padding: sp.lg, paddingBottom: 48, gap: sp.md },
    card: {
      backgroundColor: c.surface, borderRadius: rad.lg, padding: sp.lg,
      marginBottom: sp.md, borderWidth: 1, borderColor: c.border, ...elevation.md,
    },
    title: { ...scaledType.h2, color: c.text, marginBottom: 4 },
    sectionTitle: { ...scaledType.h3, color: c.text, marginBottom: sp.sm },
    subtitle: { ...scaledType.bodySoft, color: c.muted, marginBottom: sp.md },
    label: { fontSize: Math.round(13 * fs), fontWeight: "600" as const, color: c.textSoft, marginBottom: 7 },
    hint: { fontSize: Math.round(12 * fs), color: c.muted, marginTop: 4, lineHeight: 17 },
    error: { color: c.error, fontSize: Math.round(13 * fs), fontWeight: "600" as const, marginTop: sp.sm },
    input: {
      borderWidth: 1, borderColor: c.borderStrong, borderRadius: rad.md,
      paddingHorizontal: 14, paddingVertical: 12, fontSize: Math.round(15 * fs), color: c.text,
      backgroundColor: c.surface, marginBottom: sp.md,
    },
    inputRO: { backgroundColor: c.surface2, color: c.muted },
    btn: {
      backgroundColor: c.accent, paddingVertical: 13, paddingHorizontal: 18, borderRadius: rad.md,
      alignItems: "center", justifyContent: "center", flexDirection: "row", gap: sp.sm,
      minHeight: 48, ...elevation.sm,
    },
    btnText: { color: "#fff", fontWeight: "700" as const, fontSize: Math.round(15 * fs), letterSpacing: -0.2 },
    btnSoft: {
      backgroundColor: c.surface, borderWidth: 1, borderColor: c.borderStrong,
      paddingVertical: 11, paddingHorizontal: 14, borderRadius: rad.md,
      alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, minHeight: 44,
    },
    btnSoftText: { color: c.text, fontWeight: "600" as const, fontSize: Math.round(14 * fs) },
    row: { flexDirection: "row", gap: sp.sm, flexWrap: "wrap", marginTop: sp.sm },
    listItem: {
      padding: 14, backgroundColor: c.surface, borderRadius: rad.md, borderWidth: 1,
      borderColor: c.border, marginBottom: sp.sm, ...elevation.sm,
    },
    listTitle: { fontSize: Math.round(15 * fs), fontWeight: "700" as const, color: c.text, letterSpacing: -0.2 },
    listSub: { fontSize: Math.round(12.5 * fs), color: c.muted, marginTop: 4 },
    badge: {
      alignSelf: "flex-start", paddingHorizontal: 9, paddingVertical: 4, borderRadius: rad.pill,
      backgroundColor: c.accentSoft, marginTop: 6,
    },
    badgeText: { fontSize: 10, fontWeight: "800" as const, color: c.accent, textTransform: "uppercase", letterSpacing: 0.3 },
    chip: {
      paddingHorizontal: 13, paddingVertical: 9, borderRadius: rad.pill,
      backgroundColor: c.accentSoft, borderWidth: 1, borderColor: c.accentBorder,
    },
    chipText: { fontSize: Math.round(12.5 * fs), fontWeight: "700" as const, color: c.accent },
    fab: {
      position: "absolute", right: sp.lg, bottom: sp.lg, width: 58, height: 58,
      borderRadius: 29, backgroundColor: c.accent, alignItems: "center", justifyContent: "center", ...elevation.lg,
    },
    caption: { ...scaledType.caption, color: c.muted },
  });
}

/* ── Live bindings (swapped by applyScheme) ── */
export let colors = lightColors;
export let styles = makeStyles(lightColors);
export let activeScheme: Scheme = "light";
export let activePrefs: ThemePrefs = DEFAULT_PREFS;

export function applyTheme(scheme: Scheme, prefs: ThemePrefs = DEFAULT_PREFS) {
  activeScheme = scheme;
  activePrefs = prefs;
  radii = radiusScale(prefs.cornerRadius ?? DEFAULT_PREFS.cornerRadius);
  const base = scheme === "dark" ? { ...darkColors } : { ...lightColors };
  const accent = prefs.accent?.trim();
  colors = accent ? withAccent(base, accent) : base;
  styles = makeStyles(colors, prefs);
}

/** @deprecated use applyTheme */
export function applyScheme(scheme: Scheme) {
  applyTheme(scheme, activePrefs);
}

export function statusColor(kind: "success" | "error" | "warn" | "neutral") {
  return {
    success: { fg: colors.success, bg: colors.successSoft },
    error: { fg: colors.error, bg: colors.errorSoft },
    warn: { fg: colors.warn, bg: colors.warnSoft },
    neutral: { fg: colors.muted, bg: colors.surface2 },
  }[kind];
}
