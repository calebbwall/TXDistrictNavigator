import React, { useState, useEffect, useCallback, useRef } from "react";
import { StyleSheet, View, Pressable, ActivityIndicator, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useHeaderHeight } from "@react-navigation/elements";
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

const MAP_HTML = `
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

    const geoJSONData = {
      tx_senate: null,
      tx_house: null,
      us_congress: null
    };

    const layerColors = {
      tx_senate: { fill: 'rgba(74, 144, 226, 0.3)', stroke: '#4A90E2' },
      tx_house: { fill: 'rgba(233, 75, 60, 0.3)', stroke: '#E94B3C' },
      us_congress: { fill: 'rgba(80, 200, 120, 0.3)', stroke: '#50C878' }
    };

    function createLayer(type, data, colors) {
      if (!data) {
        console.log('[Leaflet] createLayer: no data for', type);
        return null;
      }
      console.log('[Leaflet] Creating layer:', type, 'with', data.features?.length || 0, 'features');
      return L.geoJSON(data, {
        style: {
          fillColor: colors.fill,
          color: colors.stroke,
          weight: 2,
          fillOpacity: 0.15
        },
        onEachFeature: function(feature, layer) {
          layer.on('click', function() {
            const districtType = type === 'senate' ? 'tx_senate' : 
                                 type === 'house' ? 'tx_house' : 'us_congress';
            const districtNum = feature.properties.district || 
                                feature.properties.SLDUST || 
                                feature.properties.SLDLST ||
                                feature.properties.CD;
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'districtClick',
              districtType: districtType,
              districtNumber: parseInt(districtNum) || 1
            }));
          });
        }
      });
    }

    function setGeoJSONData(type, data) {
      const typeKey = type === 'tx_senate' ? 'senate' : 
                      type === 'tx_house' ? 'house' : 'congress';
      geoJSONData[type] = data;
      
      if (layers[typeKey]) {
        map.removeLayer(layers[typeKey]);
      }
      layers[typeKey] = createLayer(typeKey, data, layerColors[type]);
    }

    window.toggleLayer = function(type, visible) {
      console.log('[Leaflet] toggleLayer:', type, visible);
      const layer = layers[type];
      if (!layer) {
        console.log('[Leaflet] Layer not ready yet:', type);
        return;
      }
      if (visible) {
        layer.addTo(map);
        layer.bringToFront();
        console.log('[Leaflet] Added layer to map:', type);
      } else {
        map.removeLayer(layer);
        console.log('[Leaflet] Removed layer from map:', type);
      }
    };

    window.receiveMessage = function(message) {
      try {
        const data = JSON.parse(message);
        console.log('[Leaflet] Received message:', data.type);
        if (data.type === 'setGeoJSON') {
          setGeoJSONData(data.layerType, data.geojson);
        } else if (data.type === 'toggleLayer') {
          window.toggleLayer(data.layer, data.visible);
        }
      } catch (e) {
        console.error('[Leaflet] Error processing message:', e);
      }
    };

    document.addEventListener('message', function(e) {
      window.receiveMessage(e.data);
    });
    
    window.addEventListener('message', function(e) {
      if (e.data && typeof e.data === 'string') {
        window.receiveMessage(e.data);
      }
    });

    // Send mapReady - works on both native and web
    function sendMapReady() {
      const msg = JSON.stringify({ type: 'mapReady' });
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(msg);
        console.log('[Leaflet] Sent mapReady via ReactNativeWebView');
      } else if (window.parent && window.parent !== window) {
        window.parent.postMessage(msg, '*');
        console.log('[Leaflet] Sent mapReady via window.parent.postMessage');
      } else {
        console.log('[Leaflet] No postMessage target available');
      }
    }
    
    // Delay slightly to ensure RN WebView is ready
    setTimeout(sendMapReady, 100);
  </script>
</body>
</html>
`;

// BUILD MARKER: 2026-01-17 PhaseA - Multi-overlay debug
const BUILD_TIMESTAMP = "2026-01-17 PhaseA";

interface GeoJSONLoadStatus {
  house: { loaded: boolean; features: number; error: string | null };
  senate: { loaded: boolean; features: number; error: string | null };
  congress: { loaded: boolean; features: number; error: string | null };
}

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();
  const webViewRef = useRef<WebView>(null);

  const [overlays, setOverlays] = useState<OverlayPreferences>({
    senate: true,  // Default to showing at least one overlay
    house: false,
    congress: true,
  });
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [selectedDistrict, setSelectedDistrict] = useState<SelectedDistrict | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [loadStatus, setLoadStatus] = useState<GeoJSONLoadStatus>({
    house: { loaded: false, features: 0, error: null },
    senate: { loaded: false, features: 0, error: null },
    congress: { loaded: false, features: 0, error: null },
  });

  const layerButtonScale = useSharedValue(1);

  useEffect(() => {
    getOverlayPreferences().then((prefs) => {
      console.log('[MapScreen] Loaded overlay preferences:', prefs);
      setOverlays(prefs);
      initialOverlaysRef.current = prefs;
    });
  }, []);

  const sendToWebView = useCallback((message: object) => {
    if (webViewRef.current) {
      const script = `window.receiveMessage('${JSON.stringify(message).replace(/'/g, "\\'")}'); true;`;
      webViewRef.current.injectJavaScript(script);
    }
  }, []);

  const fetchGeoJSON = useCallback(async (layerType: DistrictType) => {
    const layerKey = layerType === 'tx_house' ? 'house' : 
                     layerType === 'tx_senate' ? 'senate' : 'congress';
    try {
      const baseUrl = getApiUrl();
      const url = new URL(`/api/geojson/${layerType}`, baseUrl);
      console.log(`[MapScreen] Fetching ${layerType} from: ${url.toString()}`);
      
      const response = await fetch(url.toString());
      console.log(`[MapScreen] ${layerType} response status: ${response.status}`);
      
      if (!response.ok) {
        const errorMsg = `HTTP ${response.status}: ${response.statusText}`;
        setLoadStatus(prev => ({
          ...prev,
          [layerKey]: { loaded: false, features: 0, error: errorMsg }
        }));
        throw new Error(errorMsg);
      }
      
      const data = await response.json();
      const featureCount = data?.features?.length || 0;
      console.log(`[MapScreen] ${layerType} loaded: ${featureCount} features`);
      
      setLoadStatus(prev => ({
        ...prev,
        [layerKey]: { loaded: true, features: featureCount, error: null }
      }));
      
      return data;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[MapScreen] Error fetching ${layerType}:`, error);
      setLoadStatus(prev => ({
        ...prev,
        [layerKey]: { loaded: false, features: 0, error: errorMsg }
      }));
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

  const geoJSONLoadedRef = useRef(false);
  const initialOverlaysRef = useRef(overlays);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!mapReady || geoJSONLoadedRef.current) return;
    
    console.log('[MapScreen] Map is ready, starting GeoJSON load');
    geoJSONLoadedRef.current = true;
    
    const loadGeoJSON = async () => {
      console.log('[MapScreen] Fetching all GeoJSON...');
      const [senate, house, congress] = await Promise.all([
        fetchGeoJSON("tx_senate"),
        fetchGeoJSON("tx_house"),
        fetchGeoJSON("us_congress"),
      ]);
      
      console.log('[MapScreen] GeoJSON fetch complete, sending to WebView');
      
      // Use sendToIframe for web, sendToWebView for native
      const sendMsg = Platform.OS === 'web' 
        ? (msg: object) => {
            if (iframeRef.current?.contentWindow) {
              iframeRef.current.contentWindow.postMessage(JSON.stringify(msg), '*');
            }
          }
        : sendToWebView;
      
      if (senate) {
        sendMsg({ type: 'setGeoJSON', layerType: 'tx_senate', geojson: senate });
      }
      if (house) {
        sendMsg({ type: 'setGeoJSON', layerType: 'tx_house', geojson: house });
      }
      if (congress) {
        sendMsg({ type: 'setGeoJSON', layerType: 'us_congress', geojson: congress });
      }
      
      setDataLoaded(true);
      console.log('[MapScreen] DataLoaded set to true');
      
      // Use initial overlays to avoid stale closure
      const currentOverlays = initialOverlaysRef.current;
      console.log('[MapScreen] Applying initial overlays:', currentOverlays);
      
      if (currentOverlays.senate) sendMsg({ type: 'toggleLayer', layer: 'senate', visible: true });
      if (currentOverlays.house) sendMsg({ type: 'toggleLayer', layer: 'house', visible: true });
      if (currentOverlays.congress) sendMsg({ type: 'toggleLayer', layer: 'congress', visible: true });
    };
    
    loadGeoJSON();
  }, [mapReady, fetchGeoJSON, sendToWebView]);

  const handleToggleOverlay = useCallback(
    async (type: keyof OverlayPreferences) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const newValue = !overlays[type];
      const newOverlays = { ...overlays, [type]: newValue };
      setOverlays(newOverlays);
      await saveOverlayPreferences(newOverlays);
      
      const msg = { type: 'toggleLayer', layer: type, visible: newValue };
      if (Platform.OS === 'web') {
        if (iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage(JSON.stringify(msg), '*');
        }
      } else {
        sendToWebView(msg);
      }
    },
    [overlays, sendToWebView]
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
      const rawData = event.nativeEvent?.data || event.data;
      if (!rawData || typeof rawData !== 'string') return;
      
      const data = JSON.parse(rawData);
      console.log('[MapScreen] WebView message received:', data.type);
      if (data.type === "districtClick") {
        await handleDistrictPress(data.districtType, data.districtNumber);
      } else if (data.type === "mapReady") {
        console.log('[MapScreen] Map is ready!');
        setMapReady(true);
      }
    } catch (error) {
      console.error("[MapScreen] Error parsing WebView message:", error);
    }
  }, [handleDistrictPress]);
  
  // Listen for postMessage on web platform (iframe communication)
  useEffect(() => {
    // Only add window event listener on web platform
    if (Platform.OS !== 'web') {
      // On native, use a fallback timer since WebView handles messages via onMessage prop
      const fallbackTimer = setTimeout(() => {
        setMapReady((prev) => {
          if (!prev) {
            console.log('[MapScreen] Native fallback: forcing mapReady after timeout');
            return true;
          }
          return prev;
        });
      }, 2000);
      
      return () => {
        clearTimeout(fallbackTimer);
      };
    }
    
    const handleWindowMessage = (event: MessageEvent) => {
      if (typeof event.data === 'string') {
        try {
          const data = JSON.parse(event.data);
          console.log('[MapScreen] Window message received:', data.type);
          if (data.type === "districtClick") {
            handleDistrictPress(data.districtType, data.districtNumber);
          } else if (data.type === "mapReady") {
            console.log('[MapScreen] Map is ready (from window)!');
            setMapReady(true);
          }
        } catch (e) {
          // Not JSON, ignore
        }
      }
    };
    
    window.addEventListener('message', handleWindowMessage);
    
    // Fallback: Force mapReady after 2 seconds if not already set
    // This handles cases where WebView postMessage doesn't work on web
    const fallbackTimer = setTimeout(() => {
      setMapReady((prev) => {
        if (!prev) {
          console.log('[MapScreen] Fallback: forcing mapReady after timeout');
          return true;
        }
        return prev;
      });
    }, 2000);
    
    return () => {
      window.removeEventListener('message', handleWindowMessage);
      clearTimeout(fallbackTimer);
    };
  }, [handleDistrictPress]);

  // Create blob URL for the map HTML on web
  const mapBlobUrl = useRef<string | null>(null);
  
  useEffect(() => {
    if (Platform.OS === 'web') {
      const blob = new Blob([MAP_HTML], { type: 'text/html' });
      mapBlobUrl.current = URL.createObjectURL(blob);
      return () => {
        if (mapBlobUrl.current) {
          URL.revokeObjectURL(mapBlobUrl.current);
        }
      };
    }
  }, []);

  // Send message to iframe on web (iframeRef declared earlier)
  const sendToIframe = useCallback((message: object) => {
    if (Platform.OS === 'web' && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(JSON.stringify(message), '*');
    }
  }, []);

  // Override sendToWebView to also handle web iframe
  const sendToMap = useCallback((message: object) => {
    if (Platform.OS === 'web') {
      sendToIframe(message);
    } else {
      sendToWebView(message);
    }
  }, [sendToWebView, sendToIframe]);

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      {Platform.OS === 'web' ? (
        <iframe
          ref={(ref) => { iframeRef.current = ref; }}
          srcDoc={MAP_HTML}
          style={{ 
            flex: 1, 
            width: '100%', 
            height: '100%', 
            border: 'none',
          }}
          title="Texas Districts Map"
        />
      ) : (
        <WebView
          ref={webViewRef}
          source={{ html: MAP_HTML }}
          style={styles.map}
          onMessage={handleWebViewMessage}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          bounces={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        />
      )}

      {!dataLoaded ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.primary} />
          <ThemedText type="small" style={{ color: theme.secondaryText, marginTop: Spacing.sm }}>
            Loading map data...
          </ThemedText>
        </View>
      ) : null}

      {showDebug ? (
        <View style={[styles.debugPanel, { top: headerHeight + Spacing.sm, backgroundColor: 'rgba(0,0,0,0.85)' }]}>
          <Pressable onPress={() => setShowDebug(false)} style={styles.debugClose}>
            <ThemedText type="small" style={{ color: '#fff' }}>X</ThemedText>
          </Pressable>
          <ThemedText type="small" style={{ color: '#0f0', fontFamily: 'monospace' }}>
            BUILD: {BUILD_TIMESTAMP}
          </ThemedText>
          <ThemedText type="small" style={{ color: '#fff', fontFamily: 'monospace' }}>
            Overlays: H={overlays.house ? 'ON' : 'off'} S={overlays.senate ? 'ON' : 'off'} C={overlays.congress ? 'ON' : 'off'}
          </ThemedText>
          <ThemedText type="small" style={{ color: '#fff', fontFamily: 'monospace' }}>
            MapReady: {mapReady ? 'YES' : 'NO'} | DataLoaded: {dataLoaded ? 'YES' : 'NO'}
          </ThemedText>
          <View style={{ marginTop: 4 }}>
            <ThemedText type="small" style={{ color: loadStatus.house.loaded ? '#0f0' : '#f00', fontFamily: 'monospace' }}>
              House: {loadStatus.house.loaded ? `${loadStatus.house.features} features` : loadStatus.house.error || 'pending'}
            </ThemedText>
            <ThemedText type="small" style={{ color: loadStatus.senate.loaded ? '#0f0' : '#f00', fontFamily: 'monospace' }}>
              Senate: {loadStatus.senate.loaded ? `${loadStatus.senate.features} features` : loadStatus.senate.error || 'pending'}
            </ThemedText>
            <ThemedText type="small" style={{ color: loadStatus.congress.loaded ? '#0f0' : '#f00', fontFamily: 'monospace' }}>
              Congress: {loadStatus.congress.loaded ? `${loadStatus.congress.features} features` : loadStatus.congress.error || 'pending'}
            </ThemedText>
          </View>
        </View>
      ) : null}

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
    zIndex: 1000,
    elevation: 100,
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
    zIndex: 1000,
    elevation: 100,
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
  debugPanel: {
    position: 'absolute',
    left: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    zIndex: 100,
    elevation: 10,
    maxWidth: 220,
  },
  debugClose: {
    position: 'absolute',
    top: 4,
    right: 4,
    padding: 4,
  },
});
