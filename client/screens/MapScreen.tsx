import React, { useState, useEffect, useCallback, useRef } from "react";
import { StyleSheet, View, Pressable, ActivityIndicator, Platform, Linking, Alert } from "react-native";
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
import * as Location from "expo-location";
import { OverlayToggle } from "@/components/OverlayToggle";
import { MapResultsPanel } from "@/components/MapResultsPanel";
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
import { useDebugFlags, BUILD_MARKER } from "@/hooks/useDebugFlags";

type NavigationProp = NativeStackNavigationProp<MapStackParamList>;

interface SelectedDistrict {
  hits: DistrictHit[];
  officials: Official[];
}

const springConfig: WithSpringConfig = {
  damping: 30,
  mass: 0.5,
  stiffness: 200,
  overshootClamping: true,
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
  <link rel="stylesheet" href="https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    #map { width: 100%; height: 100%; }
    .leaflet-control-attribution { display: none; }
    .leaflet-draw-toolbar { display: none !important; }
    .user-location-marker {
      width: 20px;
      height: 20px;
      background: #4A90E2;
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
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
    let drawMode = false;
    let userLocationMarker = null;
    let userAccuracyCircle = null;
    
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

    const enabledLayers = {
      senate: false,
      house: false,
      congress: false
    };

    // Freehand drawing setup (replaces Leaflet.draw tap-to-place)
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    let freehandPoints = [];
    let freehandPolyline = null;
    let isDrawing = false;
    const MIN_DISTANCE = 8; // Minimum pixel distance between sampled points

    // Douglas-Peucker line simplification algorithm
    function douglasPeucker(points, tolerance) {
      if (points.length <= 2) return points;
      
      let maxDist = 0;
      let maxIndex = 0;
      const start = points[0];
      const end = points[points.length - 1];
      
      for (let i = 1; i < points.length - 1; i++) {
        const dist = perpendicularDistance(points[i], start, end);
        if (dist > maxDist) {
          maxDist = dist;
          maxIndex = i;
        }
      }
      
      if (maxDist > tolerance) {
        const left = douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
        const right = douglasPeucker(points.slice(maxIndex), tolerance);
        return left.slice(0, -1).concat(right);
      }
      
      return [start, end];
    }
    
    function perpendicularDistance(point, lineStart, lineEnd) {
      const dx = lineEnd[0] - lineStart[0];
      const dy = lineEnd[1] - lineStart[1];
      const lineLenSq = dx * dx + dy * dy;
      
      if (lineLenSq === 0) {
        return Math.sqrt(
          Math.pow(point[0] - lineStart[0], 2) + 
          Math.pow(point[1] - lineStart[1], 2)
        );
      }
      
      const t = Math.max(0, Math.min(1, (
        (point[0] - lineStart[0]) * dx + 
        (point[1] - lineStart[1]) * dy
      ) / lineLenSq));
      
      const projX = lineStart[0] + t * dx;
      const projY = lineStart[1] + t * dy;
      
      return Math.sqrt(
        Math.pow(point[0] - projX, 2) + 
        Math.pow(point[1] - projY, 2)
      );
    }

    function screenToLatLng(x, y) {
      const rect = document.getElementById('map').getBoundingClientRect();
      const point = L.point(x - rect.left, y - rect.top);
      return map.containerPointToLatLng(point);
    }

    function getDistance(p1, p2) {
      return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    }

    function handleDrawStart(e) {
      if (!drawMode) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      isDrawing = true;
      freehandPoints = [];
      
      // Disable map dragging while drawing
      map.dragging.disable();
      map.touchZoom.disable();
      map.doubleClickZoom.disable();
      map.scrollWheelZoom.disable();
      
      const touch = e.touches ? e.touches[0] : e;
      const latlng = screenToLatLng(touch.clientX, touch.clientY);
      freehandPoints.push({ 
        x: touch.clientX, 
        y: touch.clientY,
        latlng: latlng
      });
      
      // Create initial polyline
      if (freehandPolyline) {
        map.removeLayer(freehandPolyline);
      }
      freehandPolyline = L.polyline([latlng], {
        color: 'rgba(255, 165, 0, 0.9)',
        weight: 3,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);
      
      console.log('[DRAW] Freehand drawing started');
    }

    function handleDrawMove(e) {
      if (!drawMode || !isDrawing) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      const touch = e.touches ? e.touches[0] : e;
      const lastPoint = freehandPoints[freehandPoints.length - 1];
      
      // Sample points at minimum distance to avoid too many points
      if (lastPoint && getDistance(lastPoint, { x: touch.clientX, y: touch.clientY }) < MIN_DISTANCE) {
        return;
      }
      
      const latlng = screenToLatLng(touch.clientX, touch.clientY);
      freehandPoints.push({
        x: touch.clientX,
        y: touch.clientY,
        latlng: latlng
      });
      
      // Update polyline in real-time
      if (freehandPolyline) {
        const latlngs = freehandPoints.map(p => p.latlng);
        freehandPolyline.setLatLngs(latlngs);
      }
    }

    function handleDrawEnd(e) {
      if (!drawMode || !isDrawing) return;
      
      e.preventDefault();
      isDrawing = false;
      
      // Re-enable map interactions
      map.dragging.enable();
      map.touchZoom.enable();
      map.doubleClickZoom.enable();
      map.scrollWheelZoom.enable();
      
      if (freehandPoints.length < 3) {
        console.log('[DRAW] Not enough points, need at least 3');
        if (freehandPolyline) {
          map.removeLayer(freehandPolyline);
          freehandPolyline = null;
        }
        freehandPoints = [];
        return;
      }
      
      // Remove temporary polyline
      if (freehandPolyline) {
        map.removeLayer(freehandPolyline);
        freehandPolyline = null;
      }
      
      // Convert to coordinates for simplification
      const coords = freehandPoints.map(p => [p.latlng.lng, p.latlng.lat]);
      
      // Apply Douglas-Peucker simplification (tolerance in degrees, ~0.001 = ~100m)
      const simplified = douglasPeucker(coords, 0.001);
      
      // Close the polygon by adding first point at end
      if (simplified.length >= 3) {
        simplified.push(simplified[0]);
      }
      
      console.log('[DRAW] Raw points:', coords.length, '| Simplified:', simplified.length);
      
      // Create final polygon layer
      drawnItems.clearLayers();
      const latlngs = simplified.map(c => [c[1], c[0]]);
      const polygon = L.polygon(latlngs, {
        color: '#9B59B6',
        weight: 3,
        fillOpacity: 0.2
      });
      drawnItems.addLayer(polygon);
      
      // Send to React Native
      const geometry = {
        type: 'Polygon',
        coordinates: [simplified]
      };
      
      postMessage({
        type: 'DRAW_COMPLETE',
        geometry: geometry
      });
      
      console.log('[DRAW] Polygon created with', simplified.length, 'points');
      freehandPoints = [];
    }

    // Attach touch/mouse event listeners to map container
    const mapContainer = document.getElementById('map');
    mapContainer.addEventListener('touchstart', handleDrawStart, { passive: false });
    mapContainer.addEventListener('touchmove', handleDrawMove, { passive: false });
    mapContainer.addEventListener('touchend', handleDrawEnd, { passive: false });
    mapContainer.addEventListener('mousedown', handleDrawStart, { passive: false });
    mapContainer.addEventListener('mousemove', handleDrawMove, { passive: false });
    mapContainer.addEventListener('mouseup', handleDrawEnd, { passive: false });

    function enableDrawMode() {
      drawMode = true;
      mapContainer.style.cursor = 'crosshair';
      console.log('[DRAW] Draw mode enabled (freehand)');
    }

    function disableDrawMode() {
      drawMode = false;
      isDrawing = false;
      mapContainer.style.cursor = '';
      if (freehandPolyline) {
        map.removeLayer(freehandPolyline);
        freehandPolyline = null;
      }
      freehandPoints = [];
      console.log('[DRAW] Draw mode disabled');
    }

    function clearDrawing() {
      drawnItems.clearLayers();
      if (freehandPolyline) {
        map.removeLayer(freehandPolyline);
        freehandPolyline = null;
      }
      freehandPoints = [];
      postMessage({ type: 'DRAW_CLEARED' });
      console.log('[DRAW] Drawing cleared');
    }

    function pointInPolygon(point, polygon) {
      const [x, y] = point;
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    }

    function pointInMultiPolygon(point, multiPolygon) {
      for (const polygon of multiPolygon) {
        for (const ring of polygon) {
          if (pointInPolygon(point, ring)) return true;
        }
      }
      return false;
    }

    function findDistrictAtPoint(latlng, layerType) {
      const data = geoJSONData[layerType];
      if (!data || !data.features) return null;
      
      const point = [latlng.lng, latlng.lat];
      
      for (const feature of data.features) {
        const geom = feature.geometry;
        let found = false;
        
        if (geom.type === 'Polygon') {
          found = pointInPolygon(point, geom.coordinates[0]);
        } else if (geom.type === 'MultiPolygon') {
          found = pointInMultiPolygon(point, geom.coordinates);
        }
        
        if (found) {
          const districtNum = feature.properties.district || 
                              feature.properties.SLDUST || 
                              feature.properties.SLDLST ||
                              feature.properties.CD;
          return parseInt(districtNum) || 1;
        }
      }
      return null;
    }

    map.on('click', function(e) {
      if (drawMode) {
        console.log('[MAP_TAP] In draw mode, ignoring tap');
        return;
      }

      const latlng = e.latlng;
      const hits = [];
      
      console.log('[MAP_TAP] Click at', latlng.lat.toFixed(4), latlng.lng.toFixed(4));
      console.log('[MAP_TAP] Enabled layers:', JSON.stringify(enabledLayers));
      
      if (enabledLayers.house && geoJSONData.tx_house) {
        const district = findDistrictAtPoint(latlng, 'tx_house');
        if (district !== null) {
          hits.push({ source: 'TX_HOUSE', districtNumber: district });
          console.log('[MAP_TAP] Hit TX_HOUSE district', district);
        }
      }
      
      if (enabledLayers.senate && geoJSONData.tx_senate) {
        const district = findDistrictAtPoint(latlng, 'tx_senate');
        if (district !== null) {
          hits.push({ source: 'TX_SENATE', districtNumber: district });
          console.log('[MAP_TAP] Hit TX_SENATE district', district);
        }
      }
      
      if (enabledLayers.congress && geoJSONData.us_congress) {
        const district = findDistrictAtPoint(latlng, 'us_congress');
        if (district !== null) {
          hits.push({ source: 'US_HOUSE', districtNumber: district });
          console.log('[MAP_TAP] Hit US_HOUSE district', district);
        }
      }
      
      console.log('[MAP_TAP] Total hits:', hits.length);
      
      if (hits.length > 0) {
        postMessage({
          type: 'MAP_TAP',
          lat: latlng.lat,
          lng: latlng.lng,
          hits: hits
        });
      }
    });

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
      
      enabledLayers[type] = visible;
      console.log('[OVERLAY] enabledLayers now:', JSON.stringify(enabledLayers));
      
      const layerType = type === 'senate' ? 'tx_senate' : 
                        type === 'house' ? 'tx_house' : 'us_congress';
      
      if (visible && !loadStatus[layerType].loaded) {
        const success = await fetchAndSetGeoJSON(layerType);
        if (!success) {
          console.log('[OVERLAY]', type, 'failed to load, cannot show');
          enabledLayers[type] = false;
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

    function setUserLocation(lat, lng, accuracy) {
      const latlng = L.latLng(lat, lng);

      if (userLocationMarker) {
        userLocationMarker.setLatLng(latlng);
      } else {
        const icon = L.divIcon({
          className: 'user-location-marker',
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });
        userLocationMarker = L.marker(latlng, { icon: icon, zIndexOffset: 1000 });
        userLocationMarker.addTo(map);
      }

      if (accuracy && accuracy < 5000) {
        if (userAccuracyCircle) {
          userAccuracyCircle.setLatLng(latlng);
          userAccuracyCircle.setRadius(accuracy);
        } else {
          userAccuracyCircle = L.circle(latlng, {
            radius: accuracy,
            color: '#4A90E2',
            fillColor: '#4A90E2',
            fillOpacity: 0.1,
            weight: 1
          });
          userAccuracyCircle.addTo(map);
        }
      }

      console.log('[LOCATION] User location set:', lat.toFixed(4), lng.toFixed(4), 'accuracy:', accuracy);
    }

    function centerMap(lat, lng, zoom) {
      map.setView([lat, lng], zoom || map.getZoom());
      console.log('[LOCATION] Map centered to:', lat.toFixed(4), lng.toFixed(4));
    }

    window.receiveMessage = function(message) {
      try {
        const data = JSON.parse(message);
        console.log('[Leaflet] Received message:', data.type);
        
        if (data.type === 'setApiUrl') {
          apiBaseUrl = data.url;
          console.log('[Leaflet] API base URL set to:', apiBaseUrl);
        } else if (data.type === 'loadAllGeoJSON') {
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
        } else if (data.type === 'SET_DRAW_MODE') {
          if (data.enabled) {
            enableDrawMode();
          } else {
            disableDrawMode();
          }
        } else if (data.type === 'CLEAR_DRAWING') {
          clearDrawing();
        } else if (data.type === 'SET_USER_LOCATION') {
          setUserLocation(data.lat, data.lng, data.accuracy);
        } else if (data.type === 'CENTER_MAP') {
          centerMap(data.lat, data.lng, data.zoom);
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

    function sendMapReady() {
      postMessage({ type: 'mapReady' });
      console.log('[Leaflet] Sent mapReady');
    }
    
    setTimeout(sendMapReady, 100);
  </script>
</body>
</html>
`;

// BUILD MARKER: PhaseE 2026-01-19

interface GeoJSONLoadStatus {
  house: { loaded: boolean; features: number; error: string | null };
  senate: { loaded: boolean; features: number; error: string | null };
  congress: { loaded: boolean; features: number; error: string | null };
}

const geoJSONCache: Record<string, { data: any; timestamp: number }> = {};
const CACHE_TTL_MS = 5 * 60 * 1000;

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
  const { debugEnabled, toggleDebug } = useDebugFlags();
  const [loadStatus, setLoadStatus] = useState<GeoJSONLoadStatus>({
    house: { loaded: false, features: 0, error: null },
    senate: { loaded: false, features: 0, error: null },
    congress: { loaded: false, features: 0, error: null },
  });
  
  // Draw mode state
  const [drawModeActive, setDrawModeActive] = useState(false);
  const [drawLoading, setDrawLoading] = useState(false);
  
  // Location state
  const [locationPermission, setLocationPermission] = useState<Location.PermissionStatus | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [hasUserLocation, setHasUserLocation] = useState(false);
  const [lastLocationCoords, setLastLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

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
    
    const cached = geoJSONCache[layerType];
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      const featureCount = cached.data?.features?.length || 0;
      console.log(`[MapScreen] ${layerType} served from cache (${featureCount} features)`);
      setLoadStatus(prev => ({
        ...prev,
        [layerKey]: { loaded: true, features: featureCount, error: null }
      }));
      return cached.data;
    }
    
    try {
      const baseUrl = getApiUrl();
      const url = new URL(`/api/geojson/${layerType}`, baseUrl);
      console.log(`[MapScreen] Fetching ${layerType} from: ${url.toString()}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      const response = await fetch(url.toString(), { signal: controller.signal });
      clearTimeout(timeoutId);
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
      
      geoJSONCache[layerType] = { data, timestamp: Date.now() };
      
      setLoadStatus(prev => ({
        ...prev,
        [layerKey]: { loaded: true, features: featureCount, error: null }
      }));
      
      return data;
    } catch (error) {
      const errorMsg = error instanceof Error ? 
        (error.name === 'AbortError' ? 'Request timeout' : error.message) : 
        'Unknown error';
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

  const handleMapTap = useCallback(
    async (hits: DistrictHit[]) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      console.log('[MapScreen] handleMapTap with', hits.length, 'hits:', JSON.stringify(hits));
      
      if (hits.length === 0) return;
      
      const officials = await fetchOfficialsByDistricts(hits);
      console.log('[MapScreen] Fetched', officials.length, 'officials');
      
      setSelectedDistrict({
        hits,
        officials,
      });
    },
    [fetchOfficialsByDistricts]
  );

  const handleOfficialCardPress = useCallback((official: Official) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    console.log('[MapScreen] Official card pressed:', official.id, official.fullName);
    navigation.navigate("OfficialProfile", { officialId: official.id });
  }, [navigation]);

  // Draw mode handlers
  const handleToggleDrawMode = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newState = !drawModeActive;
    setDrawModeActive(newState);
    setSelectedDistrict(null);
    
    const msg = { type: 'SET_DRAW_MODE', enabled: newState };
    if (Platform.OS === 'web') {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(JSON.stringify(msg), '*');
      }
    } else {
      sendToWebView(msg);
    }
    console.log('[MapScreen] Draw mode:', newState ? 'ON' : 'OFF');
  }, [drawModeActive, sendToWebView]);

  const handleClearDrawing = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedDistrict(null);
    setDrawModeActive(false);
    
    const msg = { type: 'CLEAR_DRAWING' };
    if (Platform.OS === 'web') {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(JSON.stringify(msg), '*');
      }
    } else {
      sendToWebView(msg);
    }
    console.log('[MapScreen] Drawing cleared');
  }, [sendToWebView]);

  const handleDrawComplete = useCallback(async (geometry: { type: string; coordinates: number[][][] }) => {
    console.log('[MapScreen] Draw complete, geometry points:', geometry.coordinates[0]?.length);
    
    // Haptic feedback on draw complete
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    setDrawLoading(true);
    setDrawModeActive(false);
    
    try {
      // Call /api/map/area-hits to get intersecting districts
      const areaHitsUrl = new URL("/api/map/area-hits", getApiUrl());
      const areaResponse = await fetch(areaHitsUrl.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          geometry,
          overlays: {
            house: overlays.house,
            senate: overlays.senate,
            congress: overlays.congress,
          },
        }),
      });
      
      if (!areaResponse.ok) {
        console.error('[MapScreen] Area hits request failed:', areaResponse.status);
        setDrawLoading(false);
        return;
      }
      
      const { hits } = await areaResponse.json();
      console.log('[MapScreen] Area hits:', hits.length);
      
      if (hits.length === 0) {
        setSelectedDistrict({ hits: [], officials: [] });
        setDrawLoading(false);
        return;
      }
      
      // Fetch officials using existing pipeline
      const officials = await fetchOfficialsByDistricts(hits);
      console.log('[MapScreen] Draw search officials:', officials.length);
      
      setSelectedDistrict({ hits, officials });
    } catch (error) {
      console.error('[MapScreen] Draw search error:', error);
    } finally {
      setDrawLoading(false);
    }
  }, [overlays, fetchOfficialsByDistricts]);

  // Location handlers
  const handleLocateMe = useCallback(async () => {
    console.log('[MapScreen] Locate Me button pressed, platform:', Platform.OS);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLocationLoading(true);
    setLocationError(null);
    
    try {
      // For web platform, try to use browser's native geolocation API
      if (Platform.OS === 'web') {
        console.log('[MapScreen] Using browser geolocation API');
        
        if (!navigator.geolocation) {
          console.log('[MapScreen] Geolocation not supported');
          setLocationError('Not supported');
          setLocationPermission('denied' as Location.PermissionStatus);
          Alert.alert(
            'Location Not Available',
            'Your browser does not support location services.',
            [{ text: 'OK' }]
          );
          setLocationLoading(false);
          return;
        }
        
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            console.log('[MapScreen] Web location obtained:', latitude.toFixed(4), longitude.toFixed(4), 'accuracy:', accuracy);
            
            setLocationPermission('granted' as Location.PermissionStatus);
            setLastLocationCoords({ lat: latitude, lng: longitude });
            
            const locationMsg = { type: 'SET_USER_LOCATION', lat: latitude, lng: longitude, accuracy: accuracy || 100 };
            const centerMsg = { type: 'CENTER_MAP', lat: latitude, lng: longitude, zoom: 10 };
            
            if (iframeRef.current?.contentWindow) {
              iframeRef.current.contentWindow.postMessage(JSON.stringify(locationMsg), '*');
              iframeRef.current.contentWindow.postMessage(JSON.stringify(centerMsg), '*');
              console.log('[MapScreen] Web: Messages sent to iframe');
            }
            
            setHasUserLocation(true);
            setLocationLoading(false);
          },
          (error) => {
            console.log('[MapScreen] Web geolocation error:', error.code, error.message);
            setLocationError(error.message);
            setLocationPermission('denied' as Location.PermissionStatus);
            setLocationLoading(false);
            
            Alert.alert(
              'Location Access Required',
              'To show your location on the map, please allow location access when prompted by your browser.',
              [{ text: 'OK' }]
            );
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
        );
        return;
      }
      
      // Native (iOS/Android) - use expo-location
      console.log('[MapScreen] Checking location permission...');
      let { status } = await Location.getForegroundPermissionsAsync();
      console.log('[MapScreen] Current permission status:', status);
      setLocationPermission(status);
      
      if (status !== 'granted') {
        console.log('[MapScreen] Requesting location permission...');
        const result = await Location.requestForegroundPermissionsAsync();
        status = result.status;
        setLocationPermission(status);
        console.log('[MapScreen] Permission result:', status);
      }
      
      if (status !== 'granted') {
        console.log('[MapScreen] Location permission denied');
        setLocationError('Permission denied');
        setLocationLoading(false);
        
        // Show alert to user
        Alert.alert(
          'Location Access Required',
          'To show your location on the map, please enable location access in your device settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Open Settings', 
              onPress: () => {
                Linking.openSettings().catch(() => {});
              }
            }
          ]
        );
        return;
      }
      
      // Get current position (once, not continuous tracking)
      console.log('[MapScreen] Getting current position...');
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      
      const { latitude, longitude } = location.coords;
      const accuracy = location.coords.accuracy || 100;
      
      console.log('[MapScreen] Location obtained:', latitude.toFixed(4), longitude.toFixed(4), 'accuracy:', accuracy);
      
      // Store last location for debug display
      setLastLocationCoords({ lat: latitude, lng: longitude });
      
      // Send location to WebView
      const locationMsg = { type: 'SET_USER_LOCATION', lat: latitude, lng: longitude, accuracy };
      const centerMsg = { type: 'CENTER_MAP', lat: latitude, lng: longitude, zoom: 10 };
      
      console.log('[MapScreen] Sending SET_USER_LOCATION message');
      console.log('[MapScreen] Sending CENTER_MAP message');
      
      sendToWebView(locationMsg);
      sendToWebView(centerMsg);
      console.log('[MapScreen] Messages sent to WebView');
      
      setHasUserLocation(true);
    } catch (error: any) {
      console.error('[MapScreen] Location error:', error);
      const errorMsg = error?.message || 'Unknown error';
      setLocationError(errorMsg);
      
      Alert.alert(
        'Location Error',
        `Could not get your location: ${errorMsg}`,
        [{ text: 'OK' }]
      );
    } finally {
      setLocationLoading(false);
    }
  }, [sendToWebView]);

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
      if (data.type === "MAP_TAP" && Array.isArray(data.hits)) {
        console.log('[MapScreen] MAP_TAP hits:', data.hits.length, JSON.stringify(data.hits));
        await handleMapTap(data.hits);
      } else if (data.type === "mapReady") {
        console.log('[MapScreen] Map is ready!');
        setMapReady(true);
      } else if (data.type === "DRAW_COMPLETE" && data.geometry) {
        console.log('[MapScreen] DRAW_COMPLETE received');
        await handleDrawComplete(data.geometry);
      } else if (data.type === "DRAW_CLEARED") {
        console.log('[MapScreen] DRAW_CLEARED received');
        setSelectedDistrict(null);
      }
    } catch (error) {
      console.error("[MapScreen] Error parsing WebView message:", error);
    }
  }, [handleMapTap, handleDrawComplete]);
  
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
          if (data.type === "MAP_TAP" && Array.isArray(data.hits)) {
            console.log('[MapScreen] Window MAP_TAP hits:', data.hits.length);
            handleMapTap(data.hits);
          } else if (data.type === "mapReady") {
            console.log('[MapScreen] Map is ready (from window)!');
            setMapReady(true);
          } else if (data.type === "DRAW_COMPLETE" && data.geometry) {
            console.log('[MapScreen] Window DRAW_COMPLETE received');
            handleDrawComplete(data.geometry);
          } else if (data.type === "DRAW_CLEARED") {
            console.log('[MapScreen] Window DRAW_CLEARED received');
            setSelectedDistrict(null);
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
  }, [handleMapTap, handleDrawComplete]);

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

      {debugEnabled ? (
        <View style={[styles.debugPanel, { top: headerHeight + Spacing.sm, backgroundColor: 'rgba(0,0,0,0.85)' }]}>
          <Pressable onPress={toggleDebug} style={styles.debugClose}>
            <ThemedText type="small" style={{ color: '#fff' }}>X</ThemedText>
          </Pressable>
          <ThemedText type="small" style={{ color: '#0f0', fontFamily: 'monospace' }}>
            BUILD: {BUILD_MARKER}
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

      {/* Draw mode button */}
      <View
        style={[
          styles.drawButton,
          {
            top: headerHeight + Spacing.sm + 52,
            backgroundColor: drawModeActive ? '#9B59B6' : theme.cardBackground,
          },
          Shadows.md,
        ]}
      >
        <Pressable
          onPress={handleToggleDrawMode}
          style={styles.layerButtonInner}
          disabled={drawLoading}
        >
          {drawLoading ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : (
            <Feather
              name="edit-3"
              size={20}
              color={drawModeActive ? '#FFFFFF' : theme.text}
            />
          )}
        </Pressable>
      </View>

      {/* Clear drawing button - only show when there's a selection from draw */}
      {selectedDistrict && selectedDistrict.hits.length > 0 ? (
        <View
          style={[
            styles.clearButton,
            {
              top: headerHeight + Spacing.sm + 104,
              backgroundColor: theme.cardBackground,
            },
            Shadows.md,
          ]}
        >
          <Pressable
            onPress={handleClearDrawing}
            style={styles.layerButtonInner}
          >
            <Feather name="trash-2" size={20} color={theme.secondaryText} />
          </Pressable>
        </View>
      ) : null}

      {/* Locate me button */}
      <View
        style={[
          styles.locateButton,
          {
            top: headerHeight + Spacing.sm,
            backgroundColor: hasUserLocation ? theme.primary : theme.cardBackground,
          },
          Shadows.md,
        ]}
      >
        <Pressable
          onPress={handleLocateMe}
          style={styles.layerButtonInner}
          disabled={locationLoading}
        >
          {locationLoading ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : (
            <Feather
              name="navigation"
              size={20}
              color={hasUserLocation ? '#FFFFFF' : theme.text}
            />
          )}
        </Pressable>
      </View>

      {/* Location debug status line */}
      {debugEnabled ? (
        <View
          style={[
            styles.locationDebug,
            {
              top: headerHeight + Spacing.sm + 52,
              backgroundColor: 'rgba(0,0,0,0.7)',
            },
          ]}
        >
          <ThemedText type="small" style={{ color: '#fff', fontFamily: 'monospace', fontSize: 10 }}>
            Loc: {locationPermission || 'unknown'} | {lastLocationCoords ? `${lastLocationCoords.lat.toFixed(4)},${lastLocationCoords.lng.toFixed(4)}` : 'no coords'} | {locationError || 'ok'}
          </ThemedText>
        </View>
      ) : null}

      {/* Draw mode indicator */}
      {drawModeActive ? (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          style={[
            styles.drawIndicator,
            {
              top: headerHeight + Spacing.sm,
              backgroundColor: 'rgba(155, 89, 182, 0.9)',
            },
          ]}
        >
          <ThemedText type="small" style={{ color: '#FFFFFF', fontWeight: '600' }}>
            Tap points to draw a polygon, then tap first point to complete
          </ThemedText>
        </Animated.View>
      ) : null}

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
        <MapResultsPanel
          officials={selectedDistrict.officials}
          hits={selectedDistrict.hits}
          onClose={handleCloseDistrictCard}
          onOfficialPress={handleOfficialCardPress}
          onClearDrawing={selectedDistrict.hits.length > 1 ? handleClearDrawing : undefined}
        />
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
  drawButton: {
    position: "absolute",
    right: Spacing.lg,
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    zIndex: 1000,
    elevation: 100,
  },
  clearButton: {
    position: "absolute",
    right: Spacing.lg,
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    zIndex: 1000,
    elevation: 100,
  },
  locateButton: {
    position: "absolute",
    left: Spacing.lg,
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    zIndex: 1000,
    elevation: 100,
  },
  drawIndicator: {
    position: "absolute",
    left: Spacing.lg + 52,
    right: Spacing.lg + 52,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    zIndex: 900,
  },
  locationDebug: {
    position: "absolute",
    left: Spacing.lg,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
    zIndex: 999,
    maxWidth: 280,
  },
});
