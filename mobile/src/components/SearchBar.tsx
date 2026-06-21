import { TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, styles } from "../theme";

type Props = {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
};

export function SearchBar({ value, onChangeText, placeholder = "Search…" }: Props) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
      <Ionicons name="search" size={18} color={colors.muted} style={{ position: "absolute", left: 12, zIndex: 1 }} />
      <TextInput
        style={[styles.input, { flex: 1, marginBottom: 0, paddingLeft: 38 }]}
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
