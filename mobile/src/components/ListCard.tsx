import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, styles } from "../theme";
import { PressableScale } from "./ui/PressableScale";

type Props = {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: ReactNode;
  footer?: ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
  /** show a chevron affordance when the row is tappable */
  chevron?: boolean;
};

export function ListCard({ title, subtitle, onPress, right, footer, icon, chevron }: Props) {
  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      {icon ? (
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: radii.md,
            backgroundColor: colors.accentSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name={icon} size={19} color={colors.accent} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.listTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.listSub} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {chevron && onPress ? <Ionicons name="chevron-forward" size={18} color={colors.faint} /> : null}
    </View>
  );

  return (
    <View style={styles.listItem}>
      {onPress ? (
        <PressableScale onPress={onPress}>{header}</PressableScale>
      ) : (
        header
      )}
      {footer ? <View style={{ marginTop: 10 }}>{footer}</View> : null}
    </View>
  );
}
