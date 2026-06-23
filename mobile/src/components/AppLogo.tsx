import { Image, View, type ImageStyle, type StyleProp, type ViewStyle } from "react-native";
import { SsiesMark } from "./SsiesMark";

const wordmark = require("../../assets/ssies-logo.png");

type Props = {
  height?: number;
  width?: number;
  variant?: "wordmark" | "mark";
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
};

export function AppLogo({ height = 40, width, variant = "wordmark", style, imageStyle }: Props) {
  if (variant === "mark") {
    return <SsiesMark size={height} style={style} bordered={false} />;
  }
  const w = width ?? height * 2.8;
  return (
    <View style={[{ width: w, height, justifyContent: "center" }, style]}>
      <Image
        source={wordmark}
        style={[{ width: w, height }, imageStyle]}
        resizeMode="contain"
        accessibilityLabel="SSIES logo"
      />
    </View>
  );
}
