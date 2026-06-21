import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, styles } from "../theme";

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ icon, title, message, actionLabel, onAction }: Props) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 32, paddingHorizontal: 16 }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          backgroundColor: colors.accentSoft,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 12,
        }}
      >
        <Ionicons name={icon} size={28} color={colors.accent} />
      </View>
      <Text style={[styles.title, { textAlign: "center" }]}>{title}</Text>
      {message ? <Text style={[styles.subtitle, { textAlign: "center" }]}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable style={[styles.btn, { marginTop: 12, paddingHorizontal: 24 }]} onPress={onAction}>
          <Text style={styles.btnText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
