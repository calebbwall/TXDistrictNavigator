import React, { useState, useEffect, useCallback } from "react";
import { StyleSheet, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  WithSpringConfig,
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { OverlayToggle } from "@/components/OverlayToggle";
import { DistrictCard } from "@/components/DistrictCard";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing, Shadows } from "@/constants/theme";
import {
  mockDistricts,
  getOfficialByDistrictId,
  type DistrictType,
} from "@/lib/mockData";
import {
  getOverlayPreferences,
  saveOverlayPreferences,
  type OverlayPreferences,
} from "@/lib/storage";
import type { MapStackParamList } from "@/navigation/MapStackNavigator";

type NavigationProp = NativeStackNavigationProp<MapStackParamList>;

const springConfig: WithSpringConfig = {
  damping: 15,
  mass: 0.5,
  stiffness: 180,
};

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();

  const [overlays, setOverlays] = useState<OverlayPreferences>({
    senate: false,
    house: false,
    congress: false,
  });
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [selectedDistrict, setSelectedDistrict] = useState<{
    type: DistrictType;
    number: number;
  } | null>(null);

  const layerButtonScale = useSharedValue(1);

  useEffect(() => {
    getOverlayPreferences().then(setOverlays);
  }, []);

  const handleToggleOverlay = useCallback(
    async (type: keyof OverlayPreferences) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const newOverlays = { ...overlays, [type]: !overlays[type] };
      setOverlays(newOverlays);
      await saveOverlayPreferences(newOverlays);
    },
    [overlays]
  );

  const handleCloseDistrictCard = useCallback(() => {
    setSelectedDistrict(null);
  }, []);

  const handleLayerButtonPressIn = () => {
    layerButtonScale.value = withSpring(0.9, springConfig);
  };

  const handleLayerButtonPressOut = () => {
    layerButtonScale.value = withSpring(1, springConfig);
  };

  const handleLayerButtonPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowLayerPanel(!showLayerPanel);
  };

  const layerButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: layerButtonScale.value }],
  }));

  const selectedDistrictData = selectedDistrict
    ? mockDistricts.find(
        (d) =>
          d.districtType === selectedDistrict.type &&
          d.districtNumber === selectedDistrict.number
      )
    : null;

  const selectedOfficial = selectedDistrictData
    ? getOfficialByDistrictId(selectedDistrictData.id)
    : undefined;

  const handleOfficialPress = () => {
    if (selectedOfficial) {
      navigation.navigate("OfficialProfile", {
        officialId: selectedOfficial.id,
      });
    }
  };

  const activeOverlayCount = Object.values(overlays).filter(Boolean).length;

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.webFallback, { backgroundColor: theme.backgroundDefault }]}>
        <Feather name="map" size={48} color={theme.secondaryText} />
        <ThemedText
          type="body"
          style={{ color: theme.secondaryText, marginTop: Spacing.md, textAlign: "center" }}
        >
          Interactive map with district overlays
        </ThemedText>
        <ThemedText
          type="small"
          style={{ color: theme.secondaryText, marginTop: Spacing.xs, textAlign: "center" }}
        >
          Scan the QR code to view on your phone with Expo Go
        </ThemedText>
        <View style={[styles.featureList, { marginTop: Spacing.lg }]}>
          <View style={styles.featureItem}>
            <Feather name="check-circle" size={16} color={theme.primary} />
            <ThemedText type="small" style={{ marginLeft: Spacing.xs }}>
              TX Senate, House, and US Congress districts
            </ThemedText>
          </View>
          <View style={styles.featureItem}>
            <Feather name="check-circle" size={16} color={theme.primary} />
            <ThemedText type="small" style={{ marginLeft: Spacing.xs }}>
              Tap districts to see representative info
            </ThemedText>
          </View>
          <View style={styles.featureItem}>
            <Feather name="check-circle" size={16} color={theme.primary} />
            <ThemedText type="small" style={{ marginLeft: Spacing.xs }}>
              Toggle district overlays with color-coded layers
            </ThemedText>
          </View>
        </View>
      </View>

      <Animated.View
        style={[
          styles.layerButton,
          {
            top: headerHeight + Spacing.sm,
            backgroundColor: theme.cardBackground,
          },
          Shadows.md,
          layerButtonStyle,
        ]}
      >
        <Pressable
          onPress={handleLayerButtonPress}
          onPressIn={handleLayerButtonPressIn}
          onPressOut={handleLayerButtonPressOut}
          style={styles.layerButtonInner}
        >
          <Feather
            name="layers"
            size={20}
            color={showLayerPanel ? theme.primary : theme.text}
          />
          {activeOverlayCount > 0 ? (
            <View style={[styles.badge, { backgroundColor: theme.primary }]}>
              <Animated.Text style={styles.badgeText}>
                {activeOverlayCount}
              </Animated.Text>
            </View>
          ) : null}
        </Pressable>
      </Animated.View>

      {showLayerPanel ? (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          style={[
            styles.layerPanel,
            {
              top: headerHeight + Spacing.sm + 48,
              backgroundColor: theme.cardBackground,
            },
            Shadows.lg,
          ]}
        >
          <OverlayToggle
            label="TX Senate"
            isActive={overlays.senate}
            onToggle={() => handleToggleOverlay("senate")}
            activeColor={theme.overlaySenate}
            borderColor={theme.senateBorder}
          />
          <View style={{ height: Spacing.sm }} />
          <OverlayToggle
            label="TX House"
            isActive={overlays.house}
            onToggle={() => handleToggleOverlay("house")}
            activeColor={theme.overlayHouse}
            borderColor={theme.houseBorder}
          />
          <View style={{ height: Spacing.sm }} />
          <OverlayToggle
            label="US Congress"
            isActive={overlays.congress}
            onToggle={() => handleToggleOverlay("congress")}
            activeColor={theme.overlayCongress}
            borderColor={theme.congressBorder}
          />
        </Animated.View>
      ) : null}

      {selectedDistrictData ? (
        <Animated.View
          entering={SlideInDown.springify().damping(18)}
          exiting={SlideOutDown.springify().damping(18)}
          style={[
            styles.districtCardContainer,
            {
              bottom: tabBarHeight + Spacing.lg,
            },
          ]}
        >
          <DistrictCard
            district={selectedDistrictData}
            official={selectedOfficial}
            onPress={handleOfficialPress}
            onClose={handleCloseDistrictCard}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  featureList: {
    alignItems: "flex-start",
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: Spacing.xs,
  },
  layerButton: {
    position: "absolute",
    right: Spacing.lg,
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
  },
  layerButtonInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  layerPanel: {
    position: "absolute",
    right: Spacing.lg,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    minWidth: 180,
  },
  districtCardContainer: {
    position: "absolute",
    left: Spacing.lg,
    right: Spacing.lg,
  },
});
