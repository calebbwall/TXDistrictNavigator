import React, { useState, useEffect, useCallback, useRef } from "react";
import { StyleSheet, View, Pressable, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import MapView, { Polygon, Marker, PROVIDER_DEFAULT } from "react-native-maps";
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
  TEXAS_CENTER,
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

const TEXAS_REGION = {
  latitude: 31.0,
  longitude: -99.5,
  latitudeDelta: 10,
  longitudeDelta: 10,
};

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();
  const mapRef = useRef<MapView>(null);

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

  const handlePolygonPress = useCallback(
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
        mapRef.current?.animateToRegion(
          {
            latitude: polygon.center.latitude,
            longitude: polygon.center.longitude,
            latitudeDelta: 2,
            longitudeDelta: 2,
          },
          300
        );
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

  const handleRecenter = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    mapRef.current?.animateToRegion(TEXAS_REGION, 500);
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

  const getPolygonColor = (type: DistrictType, isSelected: boolean) => {
    const colors = {
      senate: { fill: theme.overlaySenate, stroke: theme.senateBorder },
      house: { fill: theme.overlayHouse, stroke: theme.houseBorder },
      congress: { fill: theme.overlayCongress, stroke: theme.congressBorder },
    };
    return {
      fillColor: isSelected ? colors[type].fill : `${colors[type].fill}40`,
      strokeColor: colors[type].stroke,
    };
  };

  const renderPolygons = (polygons: DistrictPolygon[], type: DistrictType) => {
    return polygons.map((polygon) => {
      const isSelected =
        selectedDistrict?.type === type &&
        selectedDistrict.number === polygon.districtNumber;
      const colors = getPolygonColor(type, isSelected);

      return (
        <React.Fragment key={polygon.id}>
          <Polygon
            coordinates={polygon.coordinates}
            fillColor={colors.fillColor}
            strokeColor={colors.strokeColor}
            strokeWidth={isSelected ? 3 : 1}
            tappable
            onPress={() => handlePolygonPress(polygon)}
          />
          <Marker
            coordinate={polygon.center}
            anchor={{ x: 0.5, y: 0.5 }}
            onPress={() => handlePolygonPress(polygon)}
          >
            <View
              style={[
                styles.markerContainer,
                {
                  backgroundColor: isSelected
                    ? colors.strokeColor
                    : `${colors.strokeColor}CC`,
                  borderColor: "#FFFFFF",
                  borderWidth: isSelected ? 2 : 1,
                },
              ]}
            >
              <ThemedText
                type="small"
                style={{ color: "#FFFFFF", fontWeight: "700" }}
              >
                {polygon.districtNumber}
              </ThemedText>
            </View>
          </Marker>
        </React.Fragment>
      );
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={TEXAS_REGION}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        mapType="standard"
      >
        {overlays.senate ? renderPolygons(senatePolygons, "senate") : null}
        {overlays.house ? renderPolygons(housePolygons, "house") : null}
        {overlays.congress ? renderPolygons(congressPolygons, "congress") : null}
      </MapView>

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

      <Animated.View
        style={[
          styles.recenterButton,
          {
            bottom: tabBarHeight + Spacing.lg + (selectedDistrictData ? 180 : 0),
            backgroundColor: theme.cardBackground,
          },
          Shadows.md,
        ]}
      >
        <Pressable onPress={handleRecenter} style={styles.layerButtonInner}>
          <Feather name="crosshair" size={20} color={theme.text} />
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

      {activeOverlayCount === 0 ? (
        <Animated.View
          entering={FadeIn.duration(300)}
          exiting={FadeOut.duration(200)}
          style={[
            styles.emptyOverlay,
            {
              top: headerHeight + Spacing.sm + 56,
              backgroundColor: `${theme.cardBackground}E6`,
            },
            Shadows.sm,
          ]}
        >
          <Feather name="info" size={14} color={theme.secondaryText} />
          <ThemedText
            type="small"
            style={{ color: theme.secondaryText, marginLeft: Spacing.xs }}
          >
            Tap the layer button to show districts
          </ThemedText>
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
  map: {
    flex: 1,
  },
  layerButton: {
    position: "absolute",
    right: Spacing.lg,
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
  },
  recenterButton: {
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
  emptyOverlay: {
    position: "absolute",
    left: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  markerContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});
