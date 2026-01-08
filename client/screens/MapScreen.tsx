import React, { useState, useEffect, useCallback } from "react";
import { StyleSheet, View, Pressable, ScrollView, Dimensions } from "react-native";
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
  senatePolygons,
  housePolygons,
  congressPolygons,
  type DistrictPolygon,
} from "@/lib/districtPolygons";
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

const { width: screenWidth } = Dimensions.get("window");
const GRID_SIZE = 6;
const CELL_SIZE = (screenWidth - Spacing.lg * 2 - (GRID_SIZE - 1) * 4) / GRID_SIZE;

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

  const handleDistrictPress = useCallback(
    (polygon: DistrictPolygon) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (
        selectedDistrict?.type === polygon.districtType &&
        selectedDistrict.number === polygon.districtNumber
      ) {
        setSelectedDistrict(null);
      } else {
        setSelectedDistrict({
          type: polygon.districtType,
          number: polygon.districtNumber,
        });
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

  const getDistrictColor = (type: DistrictType) => {
    switch (type) {
      case "senate":
        return { bg: theme.overlaySenate, border: theme.senateBorder };
      case "house":
        return { bg: theme.overlayHouse, border: theme.houseBorder };
      case "congress":
        return { bg: theme.overlayCongress, border: theme.congressBorder };
    }
  };

  const renderDistrictGrid = (polygons: DistrictPolygon[], type: DistrictType) => {
    const colors = getDistrictColor(type);
    return polygons.map((polygon) => {
      const isSelected =
        selectedDistrict?.type === type &&
        selectedDistrict.number === polygon.districtNumber;
      const row = Math.floor((polygon.districtNumber - 1) / GRID_SIZE);
      const col = (polygon.districtNumber - 1) % GRID_SIZE;

      return (
        <Pressable
          key={polygon.id}
          onPress={() => handleDistrictPress(polygon)}
          style={[
            styles.districtCell,
            {
              width: CELL_SIZE,
              height: CELL_SIZE,
              backgroundColor: isSelected ? colors.bg : `${colors.bg}60`,
              borderColor: isSelected ? colors.border : `${colors.border}80`,
              borderWidth: isSelected ? 2 : 1,
              left: col * (CELL_SIZE + 4),
              top: row * (CELL_SIZE + 4),
            },
          ]}
        >
          <ThemedText
            type="small"
            style={{
              color: "#FFFFFF",
              fontWeight: isSelected ? "700" : "500",
              textShadowColor: "rgba(0,0,0,0.5)",
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 2,
            }}
          >
            {polygon.districtNumber}
          </ThemedText>
        </Pressable>
      );
    });
  };

  const activePolygons = [
    ...(overlays.senate ? senatePolygons : []),
    ...(overlays.house ? housePolygons : []),
    ...(overlays.congress ? congressPolygons : []),
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.mapContainer,
          {
            paddingTop: headerHeight + Spacing.lg,
            paddingBottom: tabBarHeight + (selectedDistrictData ? 200 : Spacing.lg),
          },
        ]}
      >
        <View style={[styles.mapPlaceholder, { backgroundColor: theme.backgroundDefault }]}>
          <View style={styles.texasOutline}>
            <ThemedText type="h2" style={{ color: theme.primary, marginBottom: Spacing.sm }}>
              Texas Districts
            </ThemedText>
            <ThemedText
              type="small"
              style={{ color: theme.secondaryText, textAlign: "center", marginBottom: Spacing.lg }}
            >
              Tap a district to view representative info
            </ThemedText>
          </View>

          {activeOverlayCount === 0 ? (
            <View style={styles.emptyState}>
              <Feather name="layers" size={48} color={theme.secondaryText} />
              <ThemedText
                type="body"
                style={{ color: theme.secondaryText, marginTop: Spacing.md, textAlign: "center" }}
              >
                No layers selected
              </ThemedText>
              <ThemedText
                type="small"
                style={{ color: theme.secondaryText, marginTop: Spacing.xs, textAlign: "center" }}
              >
                Tap the layers button to show district overlays
              </ThemedText>
            </View>
          ) : (
            <View style={styles.gridContainer}>
              {overlays.senate ? (
                <View style={styles.layerSection}>
                  <View style={[styles.layerHeader, { borderColor: theme.senateBorder }]}>
                    <View style={[styles.layerDot, { backgroundColor: theme.overlaySenate }]} />
                    <ThemedText type="small" style={{ fontWeight: "600" }}>
                      TX Senate (24 Districts)
                    </ThemedText>
                  </View>
                  <View style={styles.districtGrid}>
                    {renderDistrictGrid(senatePolygons, "senate")}
                  </View>
                </View>
              ) : null}

              {overlays.house ? (
                <View style={styles.layerSection}>
                  <View style={[styles.layerHeader, { borderColor: theme.houseBorder }]}>
                    <View style={[styles.layerDot, { backgroundColor: theme.overlayHouse }]} />
                    <ThemedText type="small" style={{ fontWeight: "600" }}>
                      TX House (24 Districts)
                    </ThemedText>
                  </View>
                  <View style={styles.districtGrid}>
                    {renderDistrictGrid(housePolygons, "house")}
                  </View>
                </View>
              ) : null}

              {overlays.congress ? (
                <View style={styles.layerSection}>
                  <View style={[styles.layerHeader, { borderColor: theme.congressBorder }]}>
                    <View style={[styles.layerDot, { backgroundColor: theme.overlayCongress }]} />
                    <ThemedText type="small" style={{ fontWeight: "600" }}>
                      US Congress (24 Districts)
                    </ThemedText>
                  </View>
                  <View style={styles.districtGrid}>
                    {renderDistrictGrid(congressPolygons, "congress")}
                  </View>
                </View>
              ) : null}
            </View>
          )}
        </View>
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
  scrollView: {
    flex: 1,
  },
  mapContainer: {
    paddingHorizontal: Spacing.lg,
  },
  mapPlaceholder: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    minHeight: 400,
  },
  texasOutline: {
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xxl,
  },
  gridContainer: {
    gap: Spacing.xl,
  },
  layerSection: {
    marginBottom: Spacing.lg,
  },
  layerHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
    paddingBottom: Spacing.xs,
    borderBottomWidth: 2,
  },
  layerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: Spacing.xs,
  },
  districtGrid: {
    position: "relative",
    height: 4 * (CELL_SIZE + 4),
    width: "100%",
  },
  districtCell: {
    position: "absolute",
    borderRadius: BorderRadius.xs,
    alignItems: "center",
    justifyContent: "center",
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
