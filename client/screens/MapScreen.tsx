import React, { useState, useEffect, useCallback } from "react";
import { StyleSheet, View, Pressable, ScrollView } from "react-native";
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
import { TexasMapPlaceholder } from "@/components/TexasMapPlaceholder";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing, Shadows } from "@/constants/theme";
import {
  mockDistricts,
  getOfficialByDistrictId,
  type DistrictType,
  type District,
  type Official,
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

  const handleDistrictSelect = useCallback(
    (type: DistrictType, number: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (
        selectedDistrict?.type === type &&
        selectedDistrict.number === number
      ) {
        setSelectedDistrict(null);
      } else {
        setSelectedDistrict({ type, number });
      }
    },
    [selectedDistrict]
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
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: headerHeight + Spacing.lg,
            paddingBottom: tabBarHeight + Spacing.xl + (selectedDistrictData ? 160 : 0),
          },
        ]}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
      >
        <TexasMapPlaceholder
          overlays={overlays}
          selectedDistrict={selectedDistrict}
          onDistrictSelect={handleDistrictSelect}
        />

        {activeOverlayCount === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="layers" size={32} color={theme.secondaryText} />
            <View style={styles.emptyStateText}>
              <Feather name="arrow-up-right" size={16} color={theme.secondaryText} />
              <View style={{ marginLeft: Spacing.xs }}>
                <Feather name="layers" size={14} color={theme.secondaryText} />
              </View>
            </View>
            <View style={styles.emptyHint}>
              <Feather name="info" size={14} color={theme.secondaryText} />
              <View style={{ width: Spacing.xs }} />
              <View style={{ flex: 1 }}>
                <Animated.Text
                  style={[styles.emptyHintText, { color: theme.secondaryText }]}
                >
                  Tap the layer button above to enable district overlays
                </Animated.Text>
              </View>
            </View>
          </View>
        ) : null}
      </ScrollView>

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
            <View
              style={[styles.badge, { backgroundColor: theme.primary }]}
            >
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
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
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xl,
  },
  emptyStateText: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  emptyHint: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  emptyHintText: {
    fontSize: 14,
    textAlign: "center",
  },
});
