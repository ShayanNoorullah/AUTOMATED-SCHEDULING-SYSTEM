import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, styles } from "../theme";
import { PressableScale } from "./ui/PressableScale";
import { SsiesMark } from "./SsiesMark";

type Props = {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: ReactNode;
  footer?: ReactNode;
  /** show SSIES mark avatar (default true). Set false to hide. */
  showMark?: boolean;
  /** optional Ionicons override for special rows (e.g. templates) */
  icon?: keyof typeof Ionicons.glyphMap;
  chevron?: boolean;
};

export function ListCard({ title, subtitle, onPress, right, footer, showMark = true, icon, chevron }: Props) {
  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      {showMark ? (
        icon ? (
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              backgroundColor: colors.surface2,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name={icon} size={19} color={colors.accent} />
          </View>
        ) : (
          <SsiesMark size={40} />
        )
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
      {onPress ? <PressableScale onPress={onPress}>{header}</PressableScale> : header}
      {footer ? <View style={{ marginTop: 10 }}>{footer}</View> : null}
    </View>
  );
}
