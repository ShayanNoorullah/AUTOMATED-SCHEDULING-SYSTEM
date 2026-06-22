import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing, type as T, elevation } from "../../theme";

/** Section header with optional icon and right-side action (e.g. a button). */
export function SectionHeader({
  title,
  subtitle,
  icon,
  right,
}: {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  right?: ReactNode;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md }}>
      {icon ? (
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: radii.sm,
            backgroundColor: colors.accentSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name={icon} size={18} color={colors.accent} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={{ ...T.h2, color: colors.text }}>{title}</Text>
        {subtitle ? <Text style={{ ...T.bodySoft, color: colors.muted, marginTop: 2 }}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/** Elevated container card. */
export function Card({ children, style }: { children: ReactNode; style?: any }) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radii.lg,
          padding: spacing.lg,
          borderWidth: 1,
          borderColor: colors.border,
          ...elevation.md,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Compact stat tile for dashboards (label + big value + optional icon). */
export function StatTile({
  label,
  value,
  icon,
  tint = colors.accent,
}: {
  label: string;
  value: string | number;
  icon?: keyof typeof Ionicons.glyphMap;
  tint?: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 120,
        backgroundColor: colors.surface,
        borderRadius: radii.lg,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.lg,
        ...elevation.sm,
      }}
    >
      {icon ? (
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: radii.sm,
            backgroundColor: tint + "1A",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: spacing.sm,
          }}
        >
          <Ionicons name={icon} size={17} color={tint} />
        </View>
      ) : null}
      <Text style={{ ...T.display, fontSize: 24, color: colors.text }}>{value}</Text>
      <Text style={{ ...T.bodySoft, color: colors.muted, marginTop: 2 }}>{label}</Text>
    </View>
  );
}
