import { useEffect } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from "react-native-reanimated";
import { colors, radii, spacing, elevation } from "../../theme";

/** Shimmering placeholder block — show while data loads instead of a blank screen. */
export function Skeleton({ height = 16, width = "100%", radius = radii.sm, style }: any) {
  const o = useSharedValue(0.5);
  useEffect(() => {
    o.value = withRepeat(withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, []);
  const animStyle = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      style={[{ height, width, borderRadius: radius, backgroundColor: colors.track }, animStyle, style]}
    />
  );
}

/** A list of skeleton "cards" matching the ListCard layout. */
export function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <View style={{ gap: spacing.sm }}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={{
            padding: 14,
            backgroundColor: colors.surface,
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: colors.border,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            ...elevation.sm,
          }}
        >
          <Skeleton width={36} height={36} radius={radii.sm} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="55%" height={13} />
            <Skeleton width="80%" height={10} />
          </View>
        </View>
      ))}
    </View>
  );
}
