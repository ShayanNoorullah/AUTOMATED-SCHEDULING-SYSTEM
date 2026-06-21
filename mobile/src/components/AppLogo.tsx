import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors } from "../theme";

type Props = { size?: number; iconSize?: number };

export function AppLogo({ size = 46, iconSize = 26 }: Props) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        backgroundColor: colors.accent,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
        <Path
          d="M3.4 11.3 20.2 3.6c.8-.4 1.6.4 1.3 1.2l-6.1 16.5c-.3.8-1.4.8-1.7 0l-2.6-6.4a1 1 0 0 0-.5-.5L3.4 12.9c-.8-.3-.9-1.3.0-1.6Z"
          fill="#fff"
        />
      </Svg>
    </View>
  );
}
