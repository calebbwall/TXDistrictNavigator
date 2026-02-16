import React from "react";
import { StyleSheet, View, Image, Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  WithSpringConfig,
} from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { PartyBadge } from "@/components/PartyBadge";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";
import { type Official, getOfficeTypeLabel, type SourceType } from "@/lib/officials";
import { getProxiedPhotoUrl } from "@/lib/photoProxy";

interface OfficialCardProps {
  official: Official;
  onPress: () => void;
  onDistrictPress?: (source: SourceType, districtNumber: number) => void;
}

const springConfig: WithSpringConfig = {
  damping: 25,
  mass: 0.5,
  stiffness: 150,
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function OfficialCard({ official, onPress, onDistrictPress }: OfficialCardProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);
  const isVacant = official.isVacant === true;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.98, springConfig);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, springConfig);
  };

  const handleDistrictPress = () => {
    if (onDistrictPress && official.districtNumber) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onDistrictPress(official.source, official.districtNumber);
    }
  };

  const districtLabel = `${getOfficeTypeLabel(official.officeType, official.roleTitle)}${official.districtNumber ? ` - District ${official.districtNumber}` : ""}`;

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.container,
        { 
          backgroundColor: isVacant ? theme.backgroundDefault : theme.cardBackground, 
          borderColor: isVacant ? theme.warning : theme.border,
          borderStyle: isVacant ? "dashed" : "solid",
        },
        animatedStyle,
      ]}
    >
      <View style={[styles.avatarContainer, isVacant && styles.vacantAvatarContainer]}>
        {isVacant ? (
          <View style={[styles.vacantAvatar, { backgroundColor: theme.backgroundDefault }]}>
            <Feather name="user-x" size={24} color={theme.secondaryText} />
          </View>
        ) : getProxiedPhotoUrl(official.photoUrl) ? (
          <Image source={{ uri: getProxiedPhotoUrl(official.photoUrl)! }} style={styles.avatar} />
        ) : (
          <Image
            source={require("../../assets/images/default-avatar.png")}
            style={styles.avatar}
          />
        )}
      </View>
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <ThemedText type="body" style={{ fontWeight: "600", fontStyle: isVacant ? "italic" : "normal", flex: 1 }}>
            {official.fullName || "Unknown"}
          </ThemedText>
          {!isVacant && official.party ? <PartyBadge party={official.party} size="small" /> : null}
        </View>
        {onDistrictPress && official.districtNumber ? (
          <Pressable onPress={handleDistrictPress} hitSlop={8}>
            <View style={styles.districtLink}>
              <ThemedText type="caption" style={{ color: theme.primary }}>
                {districtLabel}
              </ThemedText>
              <Feather name="map-pin" size={12} color={theme.primary} style={{ marginLeft: 4 }} />
            </View>
          </Pressable>
        ) : (
          <ThemedText type="caption" style={{ color: theme.secondaryText }}>
            {districtLabel}
          </ThemedText>
        )}
        {isVacant ? (
          <ThemedText type="small" style={{ color: theme.warning }}>
            Seat Currently Vacant
          </ThemedText>
        ) : null}
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
  vacantAvatarContainer: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#888888",
  },
  vacantAvatar: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
    gap: 2,
  },
  districtLink: {
    flexDirection: "row",
    alignItems: "center",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
});
