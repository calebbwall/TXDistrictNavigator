import React from "react";
import { StyleSheet, Pressable, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  WithSpringConfig,
} from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";

interface SearchMethodCardProps {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  description: string;
  onPress: () => void;
}

const springConfig: WithSpringConfig = {
  damping: 15,
  mass: 0.3,
  stiffness: 180,
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function SearchMethodCard({
  icon,
  title,
  description,
  onPress,
}: SearchMethodCardProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.98, springConfig);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, springConfig);
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.container,
        { backgroundColor: theme.cardBackground, borderColor: theme.border },
        animatedStyle,
      ]}
    >
      <View style={[styles.iconContainer, { backgroundColor: theme.primary }]}>
        <Feather name={icon} size={24} color="#FFFFFF" />
      </View>
      <View style={styles.content}>
        <ThemedText type="body" style={{ fontWeight: "600" }}>
          {title}
        </ThemedText>
        <ThemedText type="caption" style={{ color: theme.secondaryText }}>
          {description}
        </ThemedText>
      </View>
      <Feather name="chevron-right" size={20} color={theme.secondaryText} />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.md,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    gap: 2,
  },
});
