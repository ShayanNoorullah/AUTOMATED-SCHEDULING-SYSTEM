import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, pressedOpacity, styles } from "../theme";

type Props = {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: ReactNode;
  footer?: ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
};

export function ListCard({ title, subtitle, onPress, right, footer, icon }: Props) {
  const inner = (
    <>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        {icon ? (
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: colors.accentSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name={icon} size={18} color={colors.accent} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.listTitle}>{title}</Text>
          {subtitle ? <Text style={styles.listSub}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {footer ? <View style={{ marginTop: 10 }}>{footer}</View> : null}
    </>
  );

  if (!onPress) {
    return <View style={styles.listItem}>{inner}</View>;
  }

  return (
    <Pressable style={({ pressed }) => [styles.listItem, pressed && { opacity: pressedOpacity }]} onPress={onPress}>
      {inner}
    </Pressable>
  );
}
