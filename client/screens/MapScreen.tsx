import React, { useState, useEffect, useCallback, useRef } from "react";
import { StyleSheet, View, Pressable, Platform, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { WebView } from "react-native-webview";
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

const LAYER_COLORS: Record<DistrictType, { fill: string; stroke: string }> = {
  tx_senate: { fill: "rgba(74, 144, 226, 0.3)", stroke: "#4A90E2" },
  tx_house: { fill: "rgba(233, 75, 60, 0.3)", stroke: "#E94B3C" },
  us_congress: { fill: "rgba(80, 200, 120, 0.3)", stroke: "#50C878" },
};

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();
  const webViewRef = useRef<WebView>(null);

  const [overlays, setOverlays] = useState<OverlayPreferences>({
    senate: false,
    house: false,
    congress: false,
  });
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [selectedDistrict, setSelectedDistrict] = useState<SelectedDistrict | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [geoJSONData, setGeoJSONData] = useState<{
    tx_senate: any;
    tx_house: any;
    us_congress: any;
  }>({ tx_senate: null, tx_house: null, us_congress: null });

  const layerButtonScale = useSharedValue(1);

  useEffect(() => {
    getOverlayPreferences().then(setOverlays);
  }, []);

  const fetchGeoJSON = useCallback(async (layerType: DistrictType) => {
    try {
      const url = new URL(`/api/geojson/${layerType}`, getApiUrl());
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error("Failed to fetch GeoJSON");
      return await response.json();
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
    const loadGeoJSON = async () => {
      const [senate, house, congress] = await Promise.all([
        fetchGeoJSON("tx_senate"),
        fetchGeoJSON("tx_house"),
        fetchGeoJSON("us_congress"),
      ]);
      setGeoJSONData({
        tx_senate: senate,
        tx_house: house,
        us_congress: congress,
      });
    };
    loadGeoJSON();
  }, [fetchGeoJSON]);

  const handleToggleOverlay = useCallback(
    async (type: keyof OverlayPreferences) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const newOverlays = { ...overlays, [type]: !overlays[type] };
      setOverlays(newOverlays);
      await saveOverlayPreferences(newOverlays);
      
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          window.toggleLayer('${type}', ${!overlays[type]});
          true;
        `);
      }
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

  const activeOverlayCount = Object.values(overlays).filter(Boolean).length;

  const getDistrictLabel = (type: DistrictType): string => {
    switch (type) {
      case "tx_senate": return "TX Senate";
      case "tx_house": return "TX House";
      case "us_congress": return "US Congress";
    }
  };

  const handleWebViewMessage = useCallback(async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "districtClick") {
        await handleDistrictPress(data.districtType, data.districtNumber);
      } else if (data.type === "mapReady") {
        setMapReady(true);
      }
    } catch (error) {
      console.error("Error parsing WebView message:", error);
    }
  }, [handleDistrictPress]);

  const mapHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    #map { width: 100%; height: 100%; }
    .leaflet-control-attribution { display: none; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const map = L.map('map', {
      center: [31.0, -100.0],
      zoom: 6,
      zoomControl: false,
      attributionControl: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    const layers = {
      senate: null,
      house: null,
      congress: null
    };

    const layerColors = {
      tx_senate: { fill: 'rgba(74, 144, 226, 0.3)', stroke: '#4A90E2' },
      tx_house: { fill: 'rgba(233, 75, 60, 0.3)', stroke: '#E94B3C' },
      us_congress: { fill: 'rgba(80, 200, 120, 0.3)', stroke: '#50C878' }
    };

    const geoJSONData = ${JSON.stringify(geoJSONData)};

    function createLayer(type, data, colors) {
      if (!data) return null;
      return L.geoJSON(data, {
        style: {
          fillColor: colors.fill,
          color: colors.stroke,
          weight: 1,
          fillOpacity: 0.3
        },
        onEachFeature: function(feature, layer) {
          layer.on('click', function() {
            const districtType = type === 'senate' ? 'tx_senate' : 
                                 type === 'house' ? 'tx_house' : 'us_congress';
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'districtClick',
              districtType: districtType,
              districtNumber: feature.properties.district
            }));
          });
        }
      });
    }

    // Initialize layers
    layers.senate = createLayer('senate', geoJSONData.tx_senate, layerColors.tx_senate);
    layers.house = createLayer('house', geoJSONData.tx_house, layerColors.tx_house);
    layers.congress = createLayer('congress', geoJSONData.us_congress, layerColors.us_congress);

    // Apply initial visibility
    const initialOverlays = ${JSON.stringify(overlays)};
    if (initialOverlays.senate && layers.senate) layers.senate.addTo(map);
    if (initialOverlays.house && layers.house) layers.house.addTo(map);
    if (initialOverlays.congress && layers.congress) layers.congress.addTo(map);

    window.toggleLayer = function(type, visible) {
      const layer = layers[type];
      if (!layer) return;
      if (visible) {
        layer.addTo(map);
      } else {
        map.removeLayer(layer);
      }
    };

    // Notify React Native that map is ready
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'mapReady' }));
  </script>
</body>
</html>
  `;

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <WebView
        ref={webViewRef}
        source={{ html: mapHtml }}
        style={styles.map}
        onMessage={handleWebViewMessage}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      />

      {!mapReady ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.primary} />
          <ThemedText type="small" style={{ color: theme.secondaryText, marginTop: Spacing.sm }}>
            Loading map...
          </ThemedText>
        </View>
      ) : null}

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
