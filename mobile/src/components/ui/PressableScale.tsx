import type { ReactNode } from "react";
import { Pressable, type PressableProps, type ViewStyle, type StyleProp } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { pressedScale } from "../../theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = PressableProps & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** scale on press (default from theme) */
  scaleTo?: number;
  /** disable the press animation but keep Pressable behaviour */
  noAnim?: boolean;
};

/**
 * Drop-in replacement for <Pressable> that adds a subtle, springy scale-down
 * on press — the single biggest "this feels native and polished" upgrade.
 */
export function PressableScale({ children, style, scaleTo = pressedScale, noAnim, ...rest }: Props) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        if (!noAnim) scale.value = withSpring(scaleTo, { damping: 18, stiffness: 320 });
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (!noAnim) scale.value = withSpring(1, { damping: 16, stiffness: 280 });
        rest.onPressOut?.(e);
      }}
      style={[style, animStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}
