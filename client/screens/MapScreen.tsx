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
import {
  normalizeOfficial,
  districtTypeToSourceType,
  getOfficeTypeLabel,
  type Official,
  type DistrictType,
  type DistrictHit,
} from "@/lib/officials";
import type { MapStackParamList } from "@/navigation/MapStackNavigator";

type NavigationProp = NativeStackNavigationProp<MapStackParamList>;

interface SelectedDistrict {
  hits: DistrictHit[];
  officials: Official[];
}

const springConfig: WithSpringConfig = {
  damping: 25,
  mass: 0.6,
  stiffness: 150,
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

    let apiBaseUrl = '';
    
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

    const loadStatus = {
      tx_senate: { loading: false, loaded: false, features: 0, error: null },
      tx_house: { loading: false, loaded: false, features: 0, error: null },
      us_congress: { loading: false, loaded: false, features: 0, error: null }
    };

    function postMessage(msg) {
      const msgStr = JSON.stringify(msg);
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(msgStr);
      } else if (window.parent && window.parent !== window) {
        window.parent.postMessage(msgStr, '*');
      }
    }

    function createLayer(type, data, colors) {
      if (!data) {
        console.log('[OVERLAY] createLayer: no data for', type);
        return null;
      }
      const featureCount = data.features?.length || 0;
      console.log('[OVERLAY]', type, 'creating layer with', featureCount, 'features');
      return L.geoJSON(data, {
        style: {
          fillColor: colors.fill,
          color: colors.stroke,
          weight: 3,
          opacity: 1,
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
            postMessage({
              type: 'districtClick',
              districtType: districtType,
              districtNumber: parseInt(districtNum) || 1
            });
          });
        }
      });
    }

    async function fetchAndSetGeoJSON(layerType) {
      if (loadStatus[layerType].loaded || loadStatus[layerType].loading) {
        console.log('[OVERLAY]', layerType, 'already loaded or loading');
        return loadStatus[layerType].loaded;
      }
      
      if (!apiBaseUrl) {
        console.log('[OVERLAY]', layerType, 'no API base URL set');
        loadStatus[layerType].error = 'No API URL';
        return false;
      }
      
      loadStatus[layerType].loading = true;
      console.log('[OVERLAY]', layerType, 'fetching from', apiBaseUrl + '/api/geojson/' + layerType);
      
      try {
        const response = await fetch(apiBaseUrl + '/api/geojson/' + layerType);
        console.log('[OVERLAY]', layerType, 'status=' + response.status);
        
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        
        const data = await response.json();
        const featureCount = data.features?.length || 0;
        console.log('[OVERLAY]', layerType, 'features=' + featureCount);
        
        geoJSONData[layerType] = data;
        loadStatus[layerType].loaded = true;
        loadStatus[layerType].features = featureCount;
        loadStatus[layerType].loading = false;
        
        // Create the layer
        const typeKey = layerType === 'tx_senate' ? 'senate' : 
                        layerType === 'tx_house' ? 'house' : 'congress';
        if (layers[typeKey]) {
          map.removeLayer(layers[typeKey]);
        }
        layers[typeKey] = createLayer(typeKey, data, layerColors[layerType]);
        console.log('[OVERLAY]', layerType, 'layerAdded=true');
        
        // Report status back
        postMessage({
          type: 'geoJSONLoaded',
          layerType: layerType,
          features: featureCount,
          success: true
        });
        
        return true;
      } catch (e) {
        console.error('[OVERLAY]', layerType, 'error=' + e.message);
        loadStatus[layerType].error = e.message;
        loadStatus[layerType].loading = false;
        
        postMessage({
          type: 'geoJSONLoaded',
          layerType: layerType,
          features: 0,
          success: false,
          error: e.message
        });
        
        return false;
      }
    }

    window.toggleLayer = async function(type, visible) {
      console.log('[OVERLAY] toggleLayer:', type, visible);
      
      // Map toggle key to layer type
      const layerType = type === 'senate' ? 'tx_senate' : 
                        type === 'house' ? 'tx_house' : 'us_congress';
      
      // Fetch data if needed when turning on
      if (visible && !loadStatus[layerType].loaded) {
        const success = await fetchAndSetGeoJSON(layerType);
        if (!success) {
          console.log('[OVERLAY]', type, 'failed to load, cannot show');
          return;
        }
      }
      
      const layer = layers[type];
      if (!layer) {
        console.log('[OVERLAY]', type, 'layer not available');
        return;
      }
      
      if (visible) {
        layer.addTo(map);
        layer.bringToFront();
        console.log('[OVERLAY]', type, 'added to map');
      } else {
        map.removeLayer(layer);
        console.log('[OVERLAY]', type, 'removed from map');
      }
    };

    window.receiveMessage = function(message) {
      try {
        const data = JSON.parse(message);
        console.log('[Leaflet] Received message:', data.type);
        
        if (data.type === 'setApiUrl') {
          apiBaseUrl = data.url;
          console.log('[Leaflet] API base URL set to:', apiBaseUrl);
        } else if (data.type === 'loadAllGeoJSON') {
          // Load all GeoJSON data
          Promise.all([
            fetchAndSetGeoJSON('tx_senate'),
            fetchAndSetGeoJSON('tx_house'),
            fetchAndSetGeoJSON('us_congress')
          ]).then(() => {
            console.log('[Leaflet] All GeoJSON loaded');
            postMessage({ type: 'allGeoJSONLoaded' });
          });
        } else if (data.type === 'toggleLayer') {
          window.toggleLayer(data.layer, data.visible);
        } else if (data.type === 'setGeoJSON') {
          // Legacy support for web iframe
          const layerType = data.layerType;
          const typeKey = layerType === 'tx_senate' ? 'senate' : 
                          layerType === 'tx_house' ? 'house' : 'congress';
          geoJSONData[layerType] = data.geojson;
          loadStatus[layerType].loaded = true;
          loadStatus[layerType].features = data.geojson.features?.length || 0;
          if (layers[typeKey]) {
            map.removeLayer(layers[typeKey]);
          }
          layers[typeKey] = createLayer(typeKey, data.geojson, layerColors[layerType]);
          console.log('[OVERLAY]', layerType, 'set via message, features=' + loadStatus[layerType].features);
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
      postMessage({ type: 'mapReady' });
      console.log('[Leaflet] Sent mapReady');
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
  const [showDebug, setShowDebug] = useState(true);
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
      // Use proper JSON escaping for injection - encode to base64 to avoid any string escaping issues
      const jsonStr = JSON.stringify(message);
      // For small messages, use direct injection
      if (jsonStr.length < 50000) {
        const escaped = jsonStr.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
        const script = `window.receiveMessage('${escaped}'); true;`;
        webViewRef.current.injectJavaScript(script);
      } else {
        // For large messages (GeoJSON), use base64 encoding to avoid escaping issues
        const base64 = btoa(unescape(encodeURIComponent(jsonStr)));
        const script = `
          try {
            const decoded = decodeURIComponent(escape(atob('${base64}')));
            window.receiveMessage(decoded);
          } catch(e) {
            console.error('[WebView] Failed to decode message:', e);
          }
          true;
        `;
        webViewRef.current.injectJavaScript(script);
      }
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

  const fetchOfficialsByDistricts = useCallback(async (hits: DistrictHit[]): Promise<Official[]> => {
    try {
      const url = new URL("/api/officials/by-districts", getApiUrl());
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ districts: hits }),
      });
      if (!response.ok) return [];
      const data = await response.json();
      console.log("[MapScreen] API response keys:", data.officials?.[0] ? Object.keys(data.officials[0]) : "empty");
      return (data.officials || []).map((raw: Record<string, unknown>) => normalizeOfficial(raw));
    } catch (error) {
      console.error("Error fetching officials:", error);
      return [];
    }
  }, []);

  const geoJSONLoadedRef = useRef(false);
  const initialOverlaysRef = useRef(overlays);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!mapReady || geoJSONLoadedRef.current) return;
    
    console.log('[MapScreen] Map is ready, starting GeoJSON load');
    geoJSONLoadedRef.current = true;
    
    const currentOverlays = initialOverlaysRef.current;
    
    // Unified approach: Always fetch in RN and push to WebView
    // Web uses iframe postMessage, native uses injectJavaScript with base64 encoding
    const loadGeoJSON = async () => {
      const platform = Platform.OS;
      console.log(`[MapScreen] ${platform}: Fetching all GeoJSON in RN...`);
      
      // Set status to pending before fetching
      setLoadStatus({
        house: { loaded: false, features: 0, error: null },
        senate: { loaded: false, features: 0, error: null },
        congress: { loaded: false, features: 0, error: null },
      });
      
      const [senate, house, congress] = await Promise.all([
        fetchGeoJSON("tx_senate"),
        fetchGeoJSON("tx_house"),
        fetchGeoJSON("us_congress"),
      ]);
      
      console.log(`[MapScreen] ${platform}: GeoJSON fetch complete, sending to WebView`);
      
      // Platform-specific message sending
      const sendMsg = platform === 'web' 
        ? (msg: object) => {
            if (iframeRef.current?.contentWindow) {
              iframeRef.current.contentWindow.postMessage(JSON.stringify(msg), '*');
            }
          }
        : sendToWebView;
      
      // Send GeoJSON data to WebView
      if (senate) {
        console.log(`[MapScreen] ${platform}: Sending tx_senate (${senate.features?.length} features)`);
        sendMsg({ type: 'setGeoJSON', layerType: 'tx_senate', geojson: senate });
      }
      if (house) {
        console.log(`[MapScreen] ${platform}: Sending tx_house (${house.features?.length} features)`);
        sendMsg({ type: 'setGeoJSON', layerType: 'tx_house', geojson: house });
      }
      if (congress) {
        console.log(`[MapScreen] ${platform}: Sending us_congress (${congress.features?.length} features)`);
        sendMsg({ type: 'setGeoJSON', layerType: 'us_congress', geojson: congress });
      }
      
      setDataLoaded(true);
      console.log(`[MapScreen] ${platform}: DataLoaded set to true`);
      
      // Small delay to ensure data is processed before toggling layers
      setTimeout(() => {
        console.log(`[MapScreen] ${platform}: Applying initial overlays:`, currentOverlays);
        if (currentOverlays.senate) sendMsg({ type: 'toggleLayer', layer: 'senate', visible: true });
        if (currentOverlays.house) sendMsg({ type: 'toggleLayer', layer: 'house', visible: true });
        if (currentOverlays.congress) sendMsg({ type: 'toggleLayer', layer: 'congress', visible: true });
      }, 100);
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
      
      const hits: DistrictHit[] = [];
      const source = districtTypeToSourceType(districtType);
      hits.push({ source, districtNumber });
      
      const officials = await fetchOfficialsByDistricts(hits);
      setSelectedDistrict({
        hits,
        officials,
      });
    },
    [fetchOfficialsByDistricts]
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
          source={{ html: MAP_HTML, baseUrl: '' }}
          style={styles.map}
          onMessage={handleWebViewMessage}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error('[WebView] Error:', nativeEvent.description, nativeEvent.url);
          }}
          onHttpError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error('[WebView] HTTP Error:', nativeEvent.statusCode, nativeEvent.url);
          }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          bounces={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          mixedContentMode="always"
          allowsInlineMediaPlayback
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
          <ThemedText type="small" style={{ color: '#ff0', fontFamily: 'monospace', fontSize: 9 }} numberOfLines={1}>
            API: {(() => { try { return getApiUrl(); } catch { return 'ERROR'; } })()}
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
          entering={SlideInDown.springify().damping(25)}
          exiting={SlideOutDown.springify().damping(25)}
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
          
          {selectedDistrict.officials.length > 0 ? (
            selectedDistrict.officials.map((official, index) => (
              <View key={official.id} style={[styles.officialInfo, index > 0 && { marginTop: Spacing.md, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: Spacing.md }]}>
                <View style={styles.districtCardHeader}>
                  <View 
                    style={[
                      styles.districtBadge, 
                      { backgroundColor: LAYER_COLORS[official.officeType === "us_house" ? "us_congress" : official.officeType].stroke }
                    ]}
                  >
                    <ThemedText type="small" style={{ color: "#FFFFFF", fontWeight: "600" }}>
                      {getOfficeTypeLabel(official.officeType)}
                    </ThemedText>
                  </View>
                  <ThemedText type="h3" style={{ color: theme.text }}>
                    District {official.districtNumber}
                  </ThemedText>
                </View>
                <ThemedText type="body" style={{ color: theme.text, fontWeight: "600", marginTop: Spacing.sm, fontStyle: official.isVacant ? "italic" : "normal" }}>
                  {official.fullName}
                </ThemedText>
                {!official.isVacant && official.party ? (
                  <ThemedText type="small" style={{ color: theme.secondaryText, marginTop: Spacing.xs }}>
                    {official.party === "R" ? "Republican" : official.party === "D" ? "Democrat" : official.party}
                  </ThemedText>
                ) : null}
                {official.capitolPhone ? (
                  <View style={{ marginTop: Spacing.sm }}>
                    <ThemedText type="small" style={{ color: theme.secondaryText }}>
                      {official.capitolPhone}
                    </ThemedText>
                  </View>
                ) : null}
              </View>
            ))
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
