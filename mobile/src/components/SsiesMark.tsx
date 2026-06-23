import { Image, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, radii } from "../theme";

const mark = require("../../assets/ssies-mark.png");

type Props = {
  size?: number;
  style?: StyleProp<ViewStyle>;
  bordered?: boolean;
};

export function SsiesMark({ size = 40, style, bordered = true }: Props) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: radii.md,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          backgroundColor: bordered ? colors.surface2 : "transparent",
          borderWidth: bordered ? 1 : 0,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      <Image
        source={mark}
        style={{ width: size * 0.82, height: size * 0.82 }}
        resizeMode="contain"
        accessibilityLabel="SSIES"
      />
    </View>
  );
}
