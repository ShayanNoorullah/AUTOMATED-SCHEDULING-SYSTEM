import { TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, styles } from "../theme";

type Props = {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
};

export function SearchBar({ value, onChangeText, placeholder = "Search…" }: Props) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 12,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radii.md,
        paddingHorizontal: 12,
        gap: 8,
      }}
    >
      <Ionicons name="search" size={18} color={colors.muted} />
      <TextInput
        style={{
          flex: 1,
          marginBottom: 0,
          paddingVertical: 12,
          fontSize: styles.input.fontSize,
          color: colors.text,
          backgroundColor: "transparent",
        }}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}
