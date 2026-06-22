import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, pressedOpacity, radii, styles } from "../theme";

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
};

export function IconButton({ icon, label, onPress, destructive }: Props) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.btnSoft,
        { flexDirection: "row", gap: 6, paddingHorizontal: 10 },
        pressed && { opacity: pressedOpacity },
      ]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={16} color={destructive ? colors.error : colors.accent} />
      <Text style={[styles.btnSoftText, destructive && { color: colors.error }]}>{label}</Text>
    </Pressable>
  );
}

type ChipProps = {
  label: string;
  onPress: () => void;
};

export function PickerChip({ label, onPress }: ChipProps) {
  return (
    <Pressable style={styles.chip} onPress={onPress}>
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

type PickerModalProps = {
  visible: boolean;
  title: string;
  items: { label: string; value: string }[];
  onSelect: (value: string) => void;
  onClose: () => void;
};

export function SimplePicker({ visible, title, items, onSelect, onClose }: PickerModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radii.lg,
            borderTopRightRadius: radii.lg,
            padding: 16,
            maxHeight: "50%",
          }}
        >
          <Text style={[styles.sectionTitle, { marginBottom: 12 }]}>{title}</Text>
          <ScrollView keyboardShouldPersistTaps="handled">
            {items.map((item) => (
              <Pressable
                key={item.value}
                style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}
                onPress={() => {
                  onSelect(item.value);
                  onClose();
                }}
              >
                <Text style={styles.listTitle}>{item.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
