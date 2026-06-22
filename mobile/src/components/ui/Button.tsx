import { ActivityIndicator, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressableScale } from "./PressableScale";
import { colors, radii, spacing, elevation } from "../../theme";

type Variant = "primary" | "soft" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg";

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
};

const SIZES: Record<Size, { h: number; px: number; fs: number; icon: number }> = {
  sm: { h: 38, px: 14, fs: 13.5, icon: 16 },
  md: { h: 48, px: 18, fs: 15, icon: 18 },
  lg: { h: 54, px: 22, fs: 16, icon: 20 },
};

function palette(v: Variant) {
  switch (v) {
    case "soft":   return { bg: colors.surface, fg: colors.text, border: colors.borderStrong };
    case "ghost":  return { bg: "transparent", fg: colors.accent, border: "transparent" };
    case "danger": return { bg: colors.error, fg: "#fff", border: "transparent" };
    case "success":return { bg: colors.success, fg: "#fff", border: "transparent" };
    default:       return { bg: colors.accent, fg: "#fff", border: "transparent" };
  }
}

/** Professional, animated button with variants, sizes, icon and loading states. */
export function Button({ label, onPress, variant = "primary", size = "md", icon, loading, disabled, full, style }: Props) {
  const s = SIZES[size];
  const p = palette(variant);
  const isFilled = variant === "primary" || variant === "danger" || variant === "success";

  return (
    <PressableScale
      onPress={loading || disabled ? undefined : onPress}
      noAnim={loading || disabled}
      style={[
        {
          height: s.h,
          paddingHorizontal: s.px,
          borderRadius: radii.md,
          backgroundColor: p.bg,
          borderWidth: variant === "soft" ? 1 : 0,
          borderColor: p.border,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: spacing.sm,
          opacity: disabled ? 0.5 : 1,
          alignSelf: full ? "stretch" : "flex-start",
          ...(isFilled ? elevation.sm : {}),
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} size="small" />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          {icon ? <Ionicons name={icon} size={s.icon} color={p.fg} /> : null}
          <Text style={{ color: p.fg, fontWeight: "700", fontSize: s.fs, letterSpacing: -0.2 }}>{label}</Text>
        </View>
      )}
    </PressableScale>
  );
}
