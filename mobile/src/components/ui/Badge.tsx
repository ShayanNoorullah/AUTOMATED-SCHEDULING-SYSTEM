import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { radii, statusColor } from "../../theme";

type Kind = "success" | "error" | "warn" | "neutral";

type Props = {
  label: string;
  kind?: Kind;
  icon?: keyof typeof Ionicons.glyphMap;
};

/** Pill status badge — e.g. "Sent 2h ago", "Failed", "Scheduled". */
export function Badge({ label, kind = "neutral", icon }: Props) {
  const c = statusColor(kind);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        alignSelf: "flex-start",
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: radii.pill,
        backgroundColor: c.bg,
      }}
    >
      {icon ? <Ionicons name={icon} size={11} color={c.fg} /> : null}
      <Text style={{ fontSize: 11, fontWeight: "700", color: c.fg, letterSpacing: 0.2 }}>{label}</Text>
    </View>
  );
}

/** Small status dot. */
export function Dot({ kind = "neutral" }: { kind?: Kind }) {
  const c = statusColor(kind);
  return <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.fg }} />;
}
