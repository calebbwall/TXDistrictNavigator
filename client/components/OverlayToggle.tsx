import React from "react";
import { StyleSheet, Pressable, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  interpolateColor,
  WithSpringConfig,
} from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";

interface OverlayToggleProps {
  label: string;
  isActive: boolean;
  onToggle: () => void;
  activeColor: string;
  borderColor: string;
}

const springConfig: WithSpringConfig = {
  damping: 15,
  mass: 0.3,
  stiffness: 200,
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function OverlayToggle({
  label,
  isActive,
  onToggle,
  activeColor,
  borderColor,
}: OverlayToggleProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);
  const progress = useSharedValue(isActive ? 1 : 0);

  React.useEffect(() => {
    progress.value = withSpring(isActive ? 1 : 0, springConfig);
  }, [isActive, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      ["transparent", activeColor]
    ),
    borderColor: borderColor,
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.97, springConfig);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, springConfig);
  };

  return (
    <AnimatedPressable
      onPress={onToggle}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.container, animatedStyle]}
    >
      <View style={styles.content}>
        <View style={[styles.indicator, { backgroundColor: borderColor }]} />
        <ThemedText type="caption" style={styles.label}>
          {label}
        </ThemedText>
      </View>
      {isActive ? (
        <Feather name="check" size={16} color={theme.text} />
      ) : null}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  indicator: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  label: {
    fontWeight: "600",
  },
});
