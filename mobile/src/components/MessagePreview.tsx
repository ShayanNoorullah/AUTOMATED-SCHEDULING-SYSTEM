import { Text, View } from "react-native";
import { replaceTokens } from "../lib/messageTokens";
import { colors, styles } from "../theme";

type Props = { message: string };

export function MessagePreview({ message }: Props) {
  const rendered = replaceTokens(message || "");
  if (!rendered.trim()) return null;
  return (
    <View
      style={{
        marginTop: 10,
        padding: 12,
        backgroundColor: colors.surface2,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text style={[styles.caption, { marginBottom: 6, color: colors.muted }]}>
        Live preview ({rendered.length} chars)
      </Text>
      <Text style={[styles.listSub, { color: colors.text, lineHeight: 20 }]}>{rendered}</Text>
    </View>
  );
}
