import React, { useState, useEffect, useCallback, useRef } from "react";
import { StyleSheet, View, Pressable, Platform, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing, Shadows } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import {
  getOverlayPreferences,
  saveOverlayPreferences,
  type OverlayPreferences,
} from "@/lib/storage";
import type { MapStackParamList } from "@/navigation/MapStackNavigator";

type NavigationProp = NativeStackNavigationProp<MapStackParamList>;

type DistrictType = "tx_house" | "tx_senate" | "us_congress";

interface GeoJSONFeature {
  type: "Feature";
  properties: {
    district: number;
    name: string;
  };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
}

interface GeoJSONCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

interface Official {
  id: string;
  name: string;
  chamber: DistrictType;
  districtNumber: number;
  photoUrl: string | null;
  party: "R" | "D";
  offices: Array<{
    type: "capitol" | "district";
    address: string;
    phone: string;
  }>;
}

interface SelectedDistrict {
  type: DistrictType;
  number: number;
  official?: Official;
}

const springConfig: WithSpringConfig = {
  damping: 15,
  mass: 0.5,
  stiffness: 180,
};

const LAYER_COLORS: Record<DistrictType, { fill: string; stroke: string; selectedFill: string }> = {
  tx_senate: { fill: "rgba(74, 144, 226, 0.3)", stroke: "#4A90E2", selectedFill: "rgba(74, 144, 226, 0.6)" },
  tx_house: { fill: "rgba(233, 75, 60, 0.3)", stroke: "#E94B3C", selectedFill: "rgba(233, 75, 60, 0.6)" },
  us_congress: { fill: "rgba(80, 200, 120, 0.3)", stroke: "#50C878", selectedFill: "rgba(80, 200, 120, 0.6)" },
};

let MapView: any = null;
let Polygon: any = null;
let PROVIDER_DEFAULT: any = null;

if (Platform.OS !== "web") {
  const RNMaps = require("react-native-maps");
  MapView = RNMaps.default;
  Polygon = RNMaps.Polygon;
  PROVIDER_DEFAULT = RNMaps.PROVIDER_DEFAULT;
}

interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

const TEXAS_REGION: Region = {
  latitude: 31.0,
  longitude: -100.0,
  latitudeDelta: 12.0,
  longitudeDelta: 12.0,
};

function convertGeoJSONToPolygons(geojson: GeoJSONCollection): Array<{
  district: number;
  coordinates: Array<{ latitude: number; longitude: number }>;
}> {
  const polygons: Array<{
    district: number;
    coordinates: Array<{ latitude: number; longitude: number }>;
  }> = [];

  for (const feature of geojson.features) {
    const { district } = feature.properties;
    const { geometry } = feature;

    if (geometry.type === "Polygon") {
      const coords = (geometry.coordinates as number[][][])[0].map(([lng, lat]) => ({
        latitude: lat,
        longitude: lng,
      }));
      polygons.push({ district, coordinates: coords });
    } else if (geometry.type === "MultiPolygon") {
      for (const polygon of geometry.coordinates as number[][][][]) {
        const coords = polygon[0].map(([lng, lat]) => ({
          latitude: lat,
          longitude: lng,
        }));
        polygons.push({ district, coordinates: coords });
      }
    }
  }

  return polygons;
}

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();
  const mapRef = useRef<any>(null);

  const [overlays, setOverlays] = useState<OverlayPreferences>({
    senate: false,
    house: false,
    congress: false,
  });
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [selectedDistrict, setSelectedDistrict] = useState<SelectedDistrict | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const [senateGeoJSON, setSenateGeoJSON] = useState<GeoJSONCollection | null>(null);
  const [houseGeoJSON, setHouseGeoJSON] = useState<GeoJSONCollection | null>(null);
  const [congressGeoJSON, setCongressGeoJSON] = useState<GeoJSONCollection | null>(null);
  const [loading, setLoading] = useState(false);

  const layerButtonScale = useSharedValue(1);

  useEffect(() => {
    getOverlayPreferences().then(setOverlays);
  }, []);

  const fetchGeoJSON = useCallback(async (layerType: DistrictType) => {
    try {
      const url = new URL(`/api/geojson/${layerType}`, getApiUrl());
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error("Failed to fetch GeoJSON");
      return await response.json() as GeoJSONCollection;
    } catch (error) {
      console.error(`Error fetching ${layerType} GeoJSON:`, error);
      return null;
    }
  }, []);

  const fetchOfficial = useCallback(async (districtType: DistrictType, districtNumber: number): Promise<Official | undefined> => {
    try {
      const url = new URL("/api/officials/by-district", getApiUrl());
      url.searchParams.set("district_type", districtType);
      url.searchParams.set("district_number", districtNumber.toString());
      const response = await fetch(url.toString());
      if (!response.ok) return undefined;
      const data = await response.json();
      return data.official;
    } catch (error) {
      console.error("Error fetching official:", error);
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;
    
    const loadGeoJSON = async () => {
      setLoading(true);
      const [senate, house, congress] = await Promise.all([
        fetchGeoJSON("tx_senate"),
        fetchGeoJSON("tx_house"),
        fetchGeoJSON("us_congress"),
      ]);
      setSenateGeoJSON(senate);
      setHouseGeoJSON(house);
      setCongressGeoJSON(congress);
      setLoading(false);
    };
    loadGeoJSON();
  }, [fetchGeoJSON]);

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
    async (districtType: DistrictType, districtNumber: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      if (selectedDistrict?.type === districtType && selectedDistrict.number === districtNumber) {
        setSelectedDistrict(null);
        return;
      }
      
      const official = await fetchOfficial(districtType, districtNumber);
      setSelectedDistrict({
        type: districtType,
        number: districtNumber,
        official,
      });
    },
    [selectedDistrict, fetchOfficial]
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

  const handleMapReady = () => {
    setMapReady(true);
  };

  const activeOverlayCount = Object.values(overlays).filter(Boolean).length;

  const renderPolygons = (
    geojson: GeoJSONCollection | null,
    layerType: DistrictType,
    isVisible: boolean
  ) => {
    if (!geojson || !isVisible || !Polygon) return null;

    const polygons = convertGeoJSONToPolygons(geojson);
    const colors = LAYER_COLORS[layerType];

    return polygons.map((polygon, index) => {
      const isSelected = selectedDistrict?.type === layerType && selectedDistrict.number === polygon.district;
      
      return (
        <Polygon
          key={`${layerType}-${polygon.district}-${index}`}
          coordinates={polygon.coordinates}
          fillColor={isSelected ? colors.selectedFill : colors.fill}
          strokeColor={colors.stroke}
          strokeWidth={isSelected ? 3 : 1}
          tappable
          onPress={() => handleDistrictPress(layerType, polygon.district)}
        />
      );
    });
  };

  const getDistrictLabel = (type: DistrictType): string => {
    switch (type) {
      case "tx_senate": return "TX Senate";
      case "tx_house": return "TX House";
      case "us_congress": return "US Congress";
    }
  };

  if (Platform.OS === "web") {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot, paddingTop: insets.top }]}>
        <View style={styles.webFallback}>
          <Feather name="map" size={64} color={theme.secondaryText} />
          <ThemedText type="h2" style={{ color: theme.text, marginTop: Spacing.lg, textAlign: "center" }}>
            Map View
          </ThemedText>
          <ThemedText type="body" style={{ color: theme.secondaryText, marginTop: Spacing.sm, textAlign: "center" }}>
            Open in Expo Go to view the interactive map with district overlays.
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.secondaryText, marginTop: Spacing.lg, textAlign: "center" }}>
            Available districts: TX House (150), TX Senate (31), US Congress (38)
          </ThemedText>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      {mapError ? (
        <View style={[styles.errorContainer, { paddingTop: insets.top }]}>
          <Feather name="alert-circle" size={48} color="#E94B3C" />
          <ThemedText type="body" style={{ color: theme.text, marginTop: Spacing.md, textAlign: "center" }}>
            {mapError}
          </ThemedText>
          <Pressable 
            onPress={() => setMapError(null)}
            style={[styles.retryButton, { backgroundColor: theme.primary }]}
          >
            <ThemedText type="body" style={{ color: "#FFFFFF" }}>Retry</ThemedText>
          </Pressable>
        </View>
      ) : (
        <>
          {MapView ? (
            <MapView
              ref={mapRef}
              style={styles.map}
              provider={PROVIDER_DEFAULT}
              initialRegion={TEXAS_REGION}
              onMapReady={handleMapReady}
              showsUserLocation
              showsMyLocationButton={false}
              showsCompass={false}
              loadingEnabled
              loadingIndicatorColor={theme.primary}
            >
              {renderPolygons(senateGeoJSON, "tx_senate", overlays.senate)}
              {renderPolygons(houseGeoJSON, "tx_house", overlays.house)}
              {renderPolygons(congressGeoJSON, "us_congress", overlays.congress)}
            </MapView>
          ) : (
            <View style={[styles.errorContainer, { paddingTop: insets.top }]}>
              <ThemedText type="body" style={{ color: theme.text }}>
                Map component not available
              </ThemedText>
            </View>
          )}

          {loading || !mapReady ? (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={theme.primary} />
              <ThemedText type="small" style={{ color: theme.secondaryText, marginTop: Spacing.sm }}>
                Loading map data...
              </ThemedText>
            </View>
          ) : null}
        </>
      )}

      <Animated.View
        style={[
          styles.layerButton,
          {
            top: insets.top + Spacing.sm,
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
              top: insets.top + Spacing.sm + 48,
              backgroundColor: theme.cardBackground,
            },
            Shadows.lg,
          ]}
        >
          <OverlayToggle
            label="TX Senate (31)"
            isActive={overlays.senate}
            onToggle={() => handleToggleOverlay("senate")}
            activeColor={LAYER_COLORS.tx_senate.stroke}
            borderColor={LAYER_COLORS.tx_senate.stroke}
          />
          <View style={{ height: Spacing.sm }} />
          <OverlayToggle
            label="TX House (150)"
            isActive={overlays.house}
            onToggle={() => handleToggleOverlay("house")}
            activeColor={LAYER_COLORS.tx_house.stroke}
            borderColor={LAYER_COLORS.tx_house.stroke}
          />
          <View style={{ height: Spacing.sm }} />
          <OverlayToggle
            label="US Congress (38)"
            isActive={overlays.congress}
            onToggle={() => handleToggleOverlay("congress")}
            activeColor={LAYER_COLORS.us_congress.stroke}
            borderColor={LAYER_COLORS.us_congress.stroke}
          />
        </Animated.View>
      ) : null}

      {selectedDistrict ? (
        <Animated.View
          entering={SlideInDown.springify().damping(18)}
          exiting={SlideOutDown.springify().damping(18)}
          style={[
            styles.districtCardContainer,
            {
              bottom: insets.bottom + Spacing.lg,
              backgroundColor: theme.cardBackground,
            },
            Shadows.lg,
          ]}
        >
          <Pressable onPress={handleCloseDistrictCard} style={styles.closeButton}>
            <Feather name="x" size={20} color={theme.secondaryText} />
          </Pressable>
          
          <View style={styles.districtCardHeader}>
            <View 
              style={[
                styles.districtBadge, 
                { backgroundColor: LAYER_COLORS[selectedDistrict.type].stroke }
              ]}
            >
              <ThemedText type="small" style={{ color: "#FFFFFF", fontWeight: "600" }}>
                {getDistrictLabel(selectedDistrict.type)}
              </ThemedText>
            </View>
            <ThemedText type="h3" style={{ color: theme.text }}>
              District {selectedDistrict.number}
            </ThemedText>
          </View>

          {selectedDistrict.official ? (
            <View style={styles.officialInfo}>
              <ThemedText type="body" style={{ color: theme.text, fontWeight: "600" }}>
                {selectedDistrict.official.name}
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.secondaryText, marginTop: Spacing.xs }}>
                {selectedDistrict.official.party === "R" ? "Republican" : "Democrat"}
              </ThemedText>
              {selectedDistrict.official.offices.length > 0 ? (
                <View style={{ marginTop: Spacing.sm }}>
                  <ThemedText type="small" style={{ color: theme.secondaryText }}>
                    {selectedDistrict.official.offices[0].phone}
                  </ThemedText>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.officialInfo}>
              <ThemedText type="small" style={{ color: theme.secondaryText }}>
                Loading official info...
              </ThemedText>
            </View>
          )}
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
  webFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  retryButton: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.8)",
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
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
  },
  closeButton: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.sm,
    padding: Spacing.xs,
  },
  districtCardHeader: {
    marginBottom: Spacing.md,
  },
  districtBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
    marginBottom: Spacing.xs,
  },
  officialInfo: {
    paddingTop: Spacing.xs,
  },
});
