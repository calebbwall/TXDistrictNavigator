import React from "react";
import { StyleSheet, View, Image, Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  WithSpringConfig,
} from "react-native-reanimated";
import AppIcon from "@/components/AppIcon";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing, Shadows } from "@/constants/theme";
import type { District, Official } from "@/lib/mockData";
import { getDistrictTypeLabel, getOfficeTypeLabel } from "@/lib/mockData";

interface DistrictCardProps {
  district: District;
  official?: Official;
  onPress: () => void;
  onClose: () => void;
}

const springConfig: WithSpringConfig = {
  damping: 20,
  mass: 0.5,
  stiffness: 180,
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function DistrictCard({
  district,
  official,
  onPress,
  onClose,
}: DistrictCardProps) {
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

  const getBorderColor = () => {
    switch (district.districtType) {
      case "senate":
        return theme.senateBorder;
      case "house":
        return theme.houseBorder;
      case "congress":
        return theme.congressBorder;
    }
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.container,
        {
          backgroundColor: theme.cardBackground,
          borderLeftColor: getBorderColor(),
        },
        Shadows.md,
        animatedStyle,
      ]}
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <ThemedText type="h3">
            {getDistrictTypeLabel(district.districtType)} {district.districtNumber}
          </ThemedText>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={({ pressed }) => [
              styles.closeButton,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <AppIcon name="x" size={20} color={theme.secondaryText} />
          </Pressable>
        </View>
      </View>

      {official ? (
        <View style={styles.officialRow}>
          <View style={styles.avatarContainer}>
            {official.photoUrl ? (
              <Image
                source={{ uri: official.photoUrl }}
                style={styles.avatar}
              />
            ) : (
              <Image
                source={require("../../assets/images/default-avatar.png")}
                style={styles.avatar}
              />
            )}
          </View>
          <View style={styles.officialInfo}>
            <ThemedText type="body" style={{ fontWeight: "600" }}>
              {official.fullName}
            </ThemedText>
            <ThemedText
              type="caption"
              style={{ color: theme.secondaryText }}
            >
              {getOfficeTypeLabel(official.officeType)} - {official.city}
            </ThemedText>
          </View>
          <AppIcon name="chevron-right" size={20} color={theme.secondaryText} />
        </View>
      ) : (
        <View style={styles.emptyRow}>
          <ThemedText type="caption" style={{ color: theme.secondaryText }}>
            No official data available
          </ThemedText>
        </View>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.md,
    borderLeftWidth: 4,
    padding: Spacing.md,
  },
  header: {
    marginBottom: Spacing.sm,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  closeButton: {
    padding: Spacing.xs,
  },
  officialRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    overflow: "hidden",
    backgroundColor: "#E0E0E0",
  },
  avatar: {
    width: 48,
    height: 48,
  },
  officialInfo: {
    flex: 1,
  },
  emptyRow: {
    paddingVertical: Spacing.sm,
  },
});
