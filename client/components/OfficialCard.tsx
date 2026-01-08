import React from "react";
import { StyleSheet, View, Image, Pressable } from "react-native";
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
import type { Official, District } from "@/lib/mockData";
import { getOfficeTypeLabel, getDistrictById } from "@/lib/mockData";

interface OfficialCardProps {
  official: Official;
  onPress: () => void;
}

const springConfig: WithSpringConfig = {
  damping: 15,
  mass: 0.3,
  stiffness: 180,
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function OfficialCard({ official, onPress }: OfficialCardProps) {
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

  const district = getDistrictById(official.districtId);

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
      <View style={styles.avatarContainer}>
        {official.photoUrl ? (
          <Image source={{ uri: official.photoUrl }} style={styles.avatar} />
        ) : (
          <Image
            source={require("../../assets/images/default-avatar.png")}
            style={styles.avatar}
          />
        )}
      </View>
      <View style={styles.info}>
        <ThemedText type="body" style={{ fontWeight: "600" }}>
          {official.fullName}
        </ThemedText>
        <ThemedText type="caption" style={{ color: theme.secondaryText }}>
          {getOfficeTypeLabel(official.officeType)}
          {district ? ` - District ${district.districtNumber}` : ""}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.secondaryText }}>
          {official.city}
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
  avatarContainer: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.full,
    overflow: "hidden",
    backgroundColor: "#E0E0E0",
  },
  avatar: {
    width: 56,
    height: 56,
  },
  info: {
    flex: 1,
    gap: 2,
  },
});
