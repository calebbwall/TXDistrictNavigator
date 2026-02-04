import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { StyleSheet, View, Pressable, ActivityIndicator, Platform, Linking, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp, useFocusEffect } from "@react-navigation/native";
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
  getAllPrivateNotesWithAddresses,
  getGeocodedAddressCache,
  saveGeocodedAddress,
  type OverlayPreferences,
  type GeocodedAddress,
} from "@/lib/storage";
import {
  normalizeOfficial,
  districtTypeToSourceType,
  getOfficeTypeLabel,
  type Official,
  type DistrictType,
  type DistrictHit,
  type SourceType,
} from "@/lib/officials";
import type { MapStackParamList } from "@/navigation/MapStackNavigator";
import { useDebugFlags, BUILD_MARKER } from "@/hooks/useDebugFlags";

type NavigationProp = NativeStackNavigationProp<MapStackParamList>;
type MapRouteProp = RouteProp<MapStackParamList, "Map">;

interface SelectedDistrict {
  hits: DistrictHit[];
  officials: Official[];
}

interface StoredPolygonResults {
  geometry: { type: string; coordinates: number[][][] };
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
    .address-dot {
      width: 12px;
      height: 12px;
      background: rgba(147, 51, 234, 0.3);
      border: 2px solid rgba(147, 51, 234, 0.5);
      border-radius: 50%;
      transition: all 0.3s ease;
    }
    .address-dot.emphasized {
      width: 18px;
      height: 18px;
      background: rgba(147, 51, 234, 0.9);
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(147, 51, 234, 0.6);
    }
    .address-dot-popup .leaflet-popup-content-wrapper {
      background: rgba(30, 30, 30, 0.95);
      border-radius: 12px;
      padding: 0;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    }
    .address-dot-popup .leaflet-popup-content {
      margin: 0;
    }
    .address-dot-popup .leaflet-popup-tip {
      background: rgba(30, 30, 30, 0.95);
    }
    .address-popup {
      padding: 12px 16px;
      cursor: pointer;
      min-width: 180px;
    }
    .address-cluster {
      width: 24px;
      height: 24px;
      background: rgba(147, 51, 234, 0.9);
      border: 2px solid white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: bold;
      color: white;
      box-shadow: 0 2px 8px rgba(147, 51, 234, 0.5);
    }
    .cluster-popup-container {
      max-height: 200px;
      overflow-y: auto;
      min-width: 200px;
    }
    .cluster-popup-container::-webkit-scrollbar {
      width: 6px;
    }
    .cluster-popup-container::-webkit-scrollbar-track {
      background: rgba(255,255,255,0.1);
      border-radius: 3px;
    }
    .cluster-popup-container::-webkit-scrollbar-thumb {
      background: rgba(147, 51, 234, 0.6);
      border-radius: 3px;
    }
    .cluster-item {
      padding: 10px 14px;
      cursor: pointer;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .cluster-item:last-child {
      border-bottom: none;
    }
    .cluster-item:hover {
      background: rgba(147, 51, 234, 0.2);
    }
    .cluster-header {
      padding: 8px 14px;
      font-size: 11px;
      color: rgba(255,255,255,0.6);
      border-bottom: 1px solid rgba(255,255,255,0.2);
      text-align: center;
    }
    .popup-name {
      color: white;
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 4px;
    }
    .popup-address {
      color: rgba(255, 255, 255, 0.7);
      font-size: 12px;
      margin-bottom: 8px;
      line-height: 1.3;
    }
    .popup-hint {
      color: #9333EA;
      font-size: 11px;
      font-weight: 500;
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

    // Address dots layer and data
    const addressDotsLayer = new L.FeatureGroup();
    map.addLayer(addressDotsLayer);
    let addressDotsData = [];
    let activeOfficialIds = [];
    let addressMarkers = {};

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

    // Initialize with default overlay settings (senate and house ON, congress OFF)
    const enabledLayers = {
      senate: true,
      house: true,
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

    function pointInRing(point, ring) {
      const [x, y] = point;
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    }

    function pointInPolygonWithHoles(point, coordinates) {
      if (!coordinates || coordinates.length === 0) return false;
      if (!pointInRing(point, coordinates[0])) return false;
      for (let i = 1; i < coordinates.length; i++) {
        if (pointInRing(point, coordinates[i])) return false;
      }
      return true;
    }

    function pointInMultiPolygon(point, multiPolygon) {
      for (const polygon of multiPolygon) {
        if (pointInPolygonWithHoles(point, polygon)) return true;
      }
      return false;
    }

    function calculatePolygonArea(coordinates) {
      if (!coordinates || coordinates.length === 0) return 0;
      const ring = coordinates[0];
      let area = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        area += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
      }
      return Math.abs(area / 2);
    }

    function findDistrictAtPoint(latlng, layerType) {
      const data = geoJSONData[layerType];
      if (!data || !data.features) return null;
      
      const point = [latlng.lng, latlng.lat];
      const matches = [];
      
      for (const feature of data.features) {
        const geom = feature.geometry;
        let found = false;
        let area = 0;
        
        if (geom.type === 'Polygon') {
          found = pointInPolygonWithHoles(point, geom.coordinates);
          area = calculatePolygonArea(geom.coordinates);
        } else if (geom.type === 'MultiPolygon') {
          found = pointInMultiPolygon(point, geom.coordinates);
          area = geom.coordinates.reduce((sum, poly) => sum + calculatePolygonArea(poly), 0);
        }
        
        if (found) {
          const districtNum = feature.properties.district || 
                              feature.properties.TX_HOUSE_DIST_NBR ||
                              feature.properties.TX_SEN_DIST_NBR ||
                              feature.properties.TX_US_HOUSE_DIST_NBR ||
                              feature.properties.TX_REP_DIST_NBR ||
                              feature.properties.SLDUST || 
                              feature.properties.SLDLST ||
                              feature.properties.CD ||
                              feature.properties.CONG_DIST ||
                              feature.properties.DIST_NBR;
          matches.push({ district: parseInt(districtNum) || 1, area });
        }
      }
      
      if (matches.length === 0) return null;
      matches.sort((a, b) => a.area - b.area);
      return matches[0].district;
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
        
        // Auto-add layer to map if it's enabled
        if (enabledLayers[typeKey] && layers[typeKey]) {
          layers[typeKey].addTo(map);
          layers[typeKey].bringToFront();
          console.log('[OVERLAY]', layerType, 'auto-added to map (enabled)');
        } else {
          console.log('[OVERLAY]', layerType, 'created but not added (disabled)');
        }
        
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

    function setAddressDots(dots) {
      addressDotsLayer.clearLayers();
      addressMarkers = {};
      addressDotsData = dots;
      
      // Group dots by location (same city will have same coordinates)
      const locationGroups = {};
      dots.forEach(function(dot) {
        // Round to 3 decimal places to group dots in same city
        const key = dot.lat.toFixed(3) + ',' + dot.lng.toFixed(3);
        if (!locationGroups[key]) {
          locationGroups[key] = [];
        }
        locationGroups[key].push(dot);
      });
      
      Object.keys(locationGroups).forEach(function(key) {
        const group = locationGroups[key];
        const firstDot = group[0];
        
        if (group.length === 1) {
          // Single official - show normal dot
          const isEmphasized = activeOfficialIds.includes(firstDot.officialId);
          const icon = L.divIcon({
            className: 'address-dot' + (isEmphasized ? ' emphasized' : ''),
            iconSize: isEmphasized ? [18, 18] : [12, 12],
            iconAnchor: isEmphasized ? [9, 9] : [6, 6]
          });
          
          const marker = L.marker([firstDot.lat, firstDot.lng], { icon: icon });
          
          const popupContent = '<div class="address-popup" onclick="window.handleAddressDotClick(\\'' + firstDot.officialId + '\\')">' +
            '<div class="popup-name">' + (firstDot.officialName || 'Unknown Official') + '</div>' +
            '<div class="popup-address">' + (firstDot.address || 'No address') + '</div>' +
            '<div class="popup-hint">Tap to view private notes</div>' +
            '</div>';
          marker.bindPopup(popupContent, {
            className: 'address-dot-popup',
            closeButton: false,
            offset: [0, -6]
          });
          
          marker.addTo(addressDotsLayer);
          addressMarkers[firstDot.officialId] = marker;
        } else {
          // Multiple officials in same city - show cluster with count
          const icon = L.divIcon({
            className: 'address-cluster',
            html: '<span>' + group.length + '</span>',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          });
          
          const marker = L.marker([firstDot.lat, firstDot.lng], { icon: icon });
          
          // Create scrollable popup with all officials
          let popupHtml = '<div class="cluster-popup-container">';
          popupHtml += '<div class="cluster-header">' + group.length + ' officials in ' + (firstDot.address || 'this location') + '</div>';
          
          group.forEach(function(dot) {
            popupHtml += '<div class="cluster-item" onclick="window.handleAddressDotClick(\\'' + dot.officialId + '\\')">' +
              '<div class="popup-name">' + (dot.officialName || 'Unknown Official') + '</div>' +
              '</div>';
          });
          
          popupHtml += '</div>';
          
          marker.bindPopup(popupHtml, {
            className: 'address-dot-popup',
            closeButton: true,
            offset: [0, -6],
            maxHeight: 250
          });
          
          marker.addTo(addressDotsLayer);
          // Store reference for all officials in this cluster
          group.forEach(function(dot) {
            addressMarkers[dot.officialId] = marker;
          });
        }
      });
      
      console.log('[DOTS] Set', dots.length, 'address dots in', Object.keys(locationGroups).length, 'locations');
    }
    
    window.handleAddressDotClick = function(officialId) {
      postMessage({ type: 'addressDotClicked', officialId: officialId });
    };

    function updateActiveOfficials(officialIds) {
      activeOfficialIds = officialIds || [];
      
      Object.keys(addressMarkers).forEach(function(officialId) {
        const marker = addressMarkers[officialId];
        const isEmphasized = activeOfficialIds.includes(officialId);
        const icon = L.divIcon({
          className: 'address-dot' + (isEmphasized ? ' emphasized' : ''),
          iconSize: isEmphasized ? [18, 18] : [12, 12],
          iconAnchor: isEmphasized ? [9, 9] : [6, 6]
        });
        marker.setIcon(icon);
      });
      
      console.log('[DOTS] Updated active officials:', activeOfficialIds.length);
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
          // Auto-add layer to map if it's already enabled
          if (enabledLayers[typeKey] && layers[typeKey]) {
            layers[typeKey].addTo(map);
            layers[typeKey].bringToFront();
            console.log('[OVERLAY]', typeKey, 'auto-added to map (was enabled)');
          }
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
        } else if (data.type === 'FOCUS_DISTRICT') {
          focusOnDistrict(data.source, data.districtNumber);
        } else if (data.type === 'SET_ADDRESS_DOTS') {
          setAddressDots(data.dots);
        } else if (data.type === 'SET_ACTIVE_OFFICIALS') {
          updateActiveOfficials(data.officialIds);
        } else if (data.type === 'HIGHLIGHT_DISTRICTS') {
          highlightDistricts(data.hits);
        } else if (data.type === 'CLEAR_HIGHLIGHTS') {
          clearHighlights();
        }
      } catch (e) {
        console.error('[Leaflet] Error processing message:', e);
      }
    };
    
    function focusOnDistrict(source, districtNumber) {
      const layerType = source === 'TX_HOUSE' ? 'tx_house' : 
                        source === 'TX_SENATE' ? 'tx_senate' : 'us_congress';
      const data = geoJSONData[layerType];
      if (!data || !data.features) {
        console.log('[FOCUS] No GeoJSON data for', layerType);
        return;
      }
      
      const feature = data.features.find(f => {
        // Fallbacks for various field naming conventions
        const districtNum = f.properties.district || 
                           f.properties.TX_HOUSE_DIST_NBR ||
                           f.properties.TX_SEN_DIST_NBR ||
                           f.properties.TX_US_HOUSE_DIST_NBR ||
                           f.properties.TX_REP_DIST_NBR ||
                           f.properties.SLDUST || 
                           f.properties.SLDLST ||
                           f.properties.CD ||
                           f.properties.CONG_DIST ||
                           f.properties.DIST_NBR;
        return parseInt(districtNum) === districtNumber;
      });
      
      if (!feature) {
        console.log('[FOCUS] District not found:', districtNumber);
        return;
      }
      
      // Calculate bounds from feature geometry
      const coords = feature.geometry.type === 'Polygon' 
        ? feature.geometry.coordinates[0] 
        : feature.geometry.coordinates[0][0];
      
      let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
      coords.forEach(([lng, lat]) => {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      });
      
      // Fit map to bounds
      const bounds = L.latLngBounds([[minLat, minLng], [maxLat, maxLng]]);
      map.fitBounds(bounds, { padding: [50, 50] });
      
      // Highlight the district
      const layerKey = layerType === 'tx_senate' ? 'senate' : 
                       layerType === 'tx_house' ? 'house' : 'congress';
      const colors = layerColors[layerType];
      
      const highlightLayer = L.geoJSON(feature, {
        style: {
          fillColor: colors.stroke,
          color: colors.stroke,
          weight: 5,
          opacity: 1,
          fillOpacity: 0.4
        }
      }).addTo(map);
      
      // Remove highlight after 3 seconds
      setTimeout(() => {
        map.removeLayer(highlightLayer);
      }, 3000);
      
      console.log('[FOCUS] Focused on district', districtNumber, 'in', layerType);
    }
    
    // Highlight multiple districts without zooming (for tap-to-search)
    let currentHighlightLayers = [];
    function highlightDistricts(hits) {
      // Clear any existing highlights
      currentHighlightLayers.forEach(layer => map.removeLayer(layer));
      currentHighlightLayers = [];
      
      hits.forEach(hit => {
        // Support both native schema (source/districtNumber) and web schema (type/district)
        const source = hit.source || (hit.type === 'tx_house' ? 'TX_HOUSE' : 
                                       hit.type === 'tx_senate' ? 'TX_SENATE' : 'US_HOUSE');
        const layerType = source === 'TX_HOUSE' ? 'tx_house' : 
                          source === 'TX_SENATE' ? 'tx_senate' : 'us_congress';
        const data = geoJSONData[layerType];
        if (!data || !data.features) return;
        
        // Support both districtNumber (native) and district (web) keys
        const districtNumber = hit.districtNumber ?? hit.district;
        const feature = data.features.find(f => {
          const districtNum = f.properties.district || 
                             f.properties.TX_HOUSE_DIST_NBR ||
                             f.properties.TX_SEN_DIST_NBR ||
                             f.properties.TX_US_HOUSE_DIST_NBR ||
                             f.properties.TX_REP_DIST_NBR ||
                             f.properties.SLDUST || 
                             f.properties.SLDLST ||
                             f.properties.CD ||
                             f.properties.CONG_DIST ||
                             f.properties.DIST_NBR;
          return parseInt(districtNum) === districtNumber;
        });
        
        if (!feature) return;
        
        const colors = layerColors[layerType];
        const highlightLayer = L.geoJSON(feature, {
          style: {
            fillColor: colors.stroke,
            color: colors.stroke,
            weight: 5,
            opacity: 1,
            fillOpacity: 0.4
          }
        }).addTo(map);
        
        currentHighlightLayers.push(highlightLayer);
      });
      
      console.log('[HIGHLIGHT] Highlighted', hits.length, 'districts');
    }
    
    function clearHighlights() {
      currentHighlightLayers.forEach(layer => map.removeLayer(layer));
      currentHighlightLayers = [];
    }

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
    
    // Auto-load GeoJSON on init for web platform
    async function autoInitOnWeb() {
      // On web, derive API URL from parent origin or use port 5000
      if (window.parent !== window) {
        try {
          // Try multiple sources to get the API URL
          let origin = '';
          if (document.referrer) {
            try {
              origin = new URL(document.referrer).origin;
            } catch (e) {}
          }
          if (!origin) {
            // Try getting from parent window (if accessible)
            try {
              origin = window.parent.location.origin;
            } catch (e) {}
          }
          if (!origin || origin === 'null') {
            // Fallback: construct from current page URL (for Replit)
            origin = 'https://' + (document.referrer ? new URL(document.referrer).host : 'localhost:5000');
          }
          // Replace port 8081 with 5000 for API
          const apiUrl = origin.replace(':8081', ':5000');
          apiBaseUrl = apiUrl;
          console.log('[Leaflet] Auto-detected API URL:', apiBaseUrl);
          
          // Fetch all GeoJSON
          const results = await Promise.all([
            fetchAndSetGeoJSON('tx_senate'),
            fetchAndSetGeoJSON('tx_house'),
            fetchAndSetGeoJSON('us_congress')
          ]);
          console.log('[Leaflet] Auto-loaded GeoJSON:', results);
          postMessage({ type: 'allGeoJSONLoaded' });
        } catch (e) {
          console.error('[Leaflet] Auto-init failed:', e);
        }
      }
    }
    
    setTimeout(() => {
      sendMapReady();
      autoInitOnWeb();
    }, 100);
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
  const route = useRoute<MapRouteProp>();
  const { theme } = useTheme();
  const webViewRef = useRef<WebView>(null);

  const [overlays, setOverlays] = useState<OverlayPreferences>({
    senate: true,   // Default to showing TX Senate overlay
    house: true,    // Default to showing TX House overlay  
    congress: false, // Default to NOT showing US Congress overlay
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
  
  // Polygon persistence state - stores drawn polygon and results even when panel is hidden
  const [storedPolygon, setStoredPolygon] = useState<StoredPolygonResults | null>(null);
  const [showResultsPanel, setShowResultsPanel] = useState(false);
  
  // Focus district state (for jump-to-district from official cards)
  const [highlightedDistrict, setHighlightedDistrict] = useState<{ source: string; district: number } | null>(null);
  
  // Single-select per overlay: max 1 district highlighted per layer
  // Keys are overlay types, values are district numbers or null if no selection
  type HighlightsByLayer = { tx_house: number | null; tx_senate: number | null; us_congress: number | null };
  const [highlightsByLayer, setHighlightsByLayer] = useState<HighlightsByLayer>({
    tx_house: null,
    tx_senate: null,
    us_congress: null,
  });
  const DEBUG_HIGHLIGHT = false; // Set to true for debugging highlight toggle
  const DEBUG_MAP = false; // Set to true for debugging overlay/map state changes
  
  // Location state
  const [locationPermission, setLocationPermission] = useState<Location.PermissionStatus | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [hasUserLocation, setHasUserLocation] = useState(false);
  const [lastLocationCoords, setLastLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Address dots state
  interface AddressDot {
    officialId: string;
    officialName: string;
    address: string;
    lat: number;
    lng: number;
    source: "TX_HOUSE" | "TX_SENATE" | "US_HOUSE" | "OTHER_TX";
  }
  const [addressDots, setAddressDots] = useState<AddressDot[]>([]);

  const layerButtonScale = useSharedValue(1);

  useEffect(() => {
    getOverlayPreferences().then((prefs) => {
      console.log('[MapScreen] Loaded overlay preferences:', prefs);
      setOverlays(prefs);
      initialOverlaysRef.current = prefs;
    });
  }, []);

  // Geocode address using Nominatim (OpenStreetMap) - free, no API key needed
  const geocodeAddress = useCallback(async (address: string): Promise<{ lat: number; lng: number } | null> => {
    const tryGeocode = async (query: string): Promise<{ lat: number; lng: number } | null> => {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
      console.log('[Geocode] Fetching:', url);
      
      const response = await fetch(url, {
        headers: { 'User-Agent': 'TXDistrictNavigator/1.0' }
      });
      
      if (!response.ok) return null;
      
      const results = await response.json();
      if (results.length === 0) return null;
      
      return {
        lat: parseFloat(results[0].lat),
        lng: parseFloat(results[0].lon)
      };
    };

    try {
      // Add Texas to address if not present for better results
      const fullAddress = address.toLowerCase().includes('texas') || address.toLowerCase().includes(', tx') 
        ? address 
        : `${address}, Texas`;
      
      // Try full address first
      let result = await tryGeocode(fullAddress);
      if (result) return result;
      
      // Fallback: Try to extract city/state/zip and geocode that
      // Common patterns: "Street, City, ST ZIP" or "Street, City, State ZIP"
      const cityZipMatch = address.match(/,\s*([^,]+),\s*(?:TX|Texas)\s*(\d{5})?/i);
      if (cityZipMatch) {
        const city = cityZipMatch[1].trim();
        const zip = cityZipMatch[2];
        const fallbackQuery = zip ? `${city}, TX ${zip}` : `${city}, Texas`;
        console.log('[Geocode] Trying fallback:', fallbackQuery);
        await new Promise(r => setTimeout(r, 200)); // Rate limit
        result = await tryGeocode(fallbackQuery);
        if (result) {
          console.log('[Geocode] Fallback succeeded for city:', city);
          return result;
        }
      }
      
      console.log('[Geocode] No results found for:', address);
      return null;
    } catch (error) {
      console.log('[MapScreen] Geocoding failed for:', address, error);
      return null;
    }
  }, []);

  // Load and geocode addresses for dots - reload when screen comes into focus
  // Fetches from BOTH server database (hometowns) AND local storage (user edits)
  // Uses a two-phase approach: 1) immediately show cached dots, 2) geocode remaining in background
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      
      const loadAddressDots = async () => {
        try {
          // Fetch addresses from server database (includes auto-filled hometowns)
          const addressMap = new Map<string, { officialName: string; personalAddress: string; source: "TX_HOUSE" | "TX_SENATE" | "US_HOUSE" | "OTHER_TX" }>();
          
          try {
            const url = new URL('/api/officials/with-addresses', getApiUrl());
            const response = await fetch(url.toString());
            if (response.ok) {
              const data = await response.json();
              console.log('[MapScreen] Fetched', data.addresses?.length || 0, 'addresses from server');
              for (const addr of data.addresses || []) {
                addressMap.set(addr.officialId, {
                  officialName: addr.officialName,
                  personalAddress: addr.personalAddress,
                  source: addr.source,
                });
              }
            }
          } catch (e) {
            console.log('[MapScreen] Could not fetch server addresses:', e);
          }
          
          if (cancelled) return;
          
          // Also check local storage for any user edits not yet synced
          const localNotes = await getAllPrivateNotesWithAddresses();
          for (const { officialId, personalAddress } of localNotes) {
            if (!addressMap.has(officialId)) {
              // Local-only address - need to fetch official info
              try {
                const url = new URL(`/api/officials/${officialId}`, getApiUrl());
                const response = await fetch(url.toString());
                if (response.ok) {
                  const data = await response.json();
                  addressMap.set(officialId, {
                    officialName: data.official?.fullName || 'Unknown Official',
                    personalAddress,
                    source: data.official?.source || "OTHER_TX",
                  });
                }
              } catch (e) {
                console.log('[MapScreen] Could not fetch official:', e);
              }
            }
          }
          
          if (cancelled) return;
          
          if (addressMap.size === 0) {
            console.log('[MapScreen] No addresses found');
            setAddressDots([]);
            return;
          }

          console.log('[MapScreen] Total officials with addresses:', addressMap.size);
          
          const cache = await getGeocodedAddressCache();
          const cachedDots: AddressDot[] = [];
          const toGeocode: Array<{ officialId: string; officialName: string; personalAddress: string; source: "TX_HOUSE" | "TX_SENATE" | "US_HOUSE" | "OTHER_TX" }> = [];

          // Phase 1: Immediately load all cached addresses
          for (const [officialId, data] of addressMap) {
            const { officialName, personalAddress, source: officialSource } = data;
            
            const cached = cache[officialId];
            if (cached && cached.address === personalAddress) {
              cachedDots.push({ 
                officialId, 
                officialName, 
                address: personalAddress, 
                lat: cached.lat, 
                lng: cached.lng,
                source: officialSource
              });
            } else {
              toGeocode.push({ officialId, officialName, personalAddress, source: officialSource });
            }
          }

          // Set cached dots immediately so they appear right away
          console.log('[MapScreen] Loaded', cachedDots.length, 'cached address dots,', toGeocode.length, 'need geocoding');
          setAddressDots(cachedDots);
          
          if (cancelled) return;
          
          // Phase 2: Geocode remaining addresses in background and update incrementally
          if (toGeocode.length > 0) {
            const newDots = [...cachedDots];
            let geocodedCount = 0;
            
            for (const { officialId, officialName, personalAddress, source: officialSource } of toGeocode) {
              if (cancelled) return;
              
              await new Promise(r => setTimeout(r, 300)); // Slightly longer delay to avoid rate limiting
              
              if (cancelled) return;
              
              const coords = await geocodeAddress(personalAddress);
              if (coords) {
                newDots.push({ 
                  officialId, 
                  officialName, 
                  address: personalAddress, 
                  lat: coords.lat, 
                  lng: coords.lng,
                  source: officialSource
                });
                await saveGeocodedAddress(officialId, personalAddress, coords.lat, coords.lng);
                geocodedCount++;
                
                // Update state every 5 successful geocodes to show progress
                if (geocodedCount % 5 === 0 && !cancelled) {
                  setAddressDots([...newDots]);
                }
              } else {
                console.log('[MapScreen] Could not geocode:', personalAddress);
              }
            }
            
            // Final update with all dots
            if (!cancelled) {
              console.log('[MapScreen] Finished geocoding, total dots:', newDots.length);
              setAddressDots(newDots);
            }
          }
        } catch (error) {
          console.error('[MapScreen] Error loading address dots:', error);
        }
      };

      loadAddressDots();
      
      return () => {
        cancelled = true;
      };
    }, [geocodeAddress])
  );
  
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
    
    const fetchFromEndpoint = async (endpoint: string) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      const response = await fetch(endpoint, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    };
    
    const validateGeoJSON = (data: unknown): boolean => {
      if (!data || typeof data !== 'object') return false;
      const geojson = data as { features?: unknown[] };
      if (!Array.isArray(geojson.features) || geojson.features.length === 0) return false;
      return true;
    };
    
    try {
      const baseUrl = getApiUrl();
      const simplifiedUrl = new URL(`/api/geojson/${layerType}`, baseUrl);
      console.log(`[MapScreen] Fetching ${layerType} (simplified) from: ${simplifiedUrl.toString()}`);
      
      let data;
      let usedFallback = false;
      
      try {
        data = await fetchFromEndpoint(simplifiedUrl.toString());
        
        if (!validateGeoJSON(data)) {
          console.warn(`[MapScreen] ${layerType} simplified GeoJSON failed validation, trying full version`);
          throw new Error('Validation failed');
        }
      } catch (simplifiedError) {
        console.log(`[MapScreen] ${layerType} simplified failed, falling back to full version`);
        const fullUrl = new URL(`/api/geojson/${layerType}_full`, baseUrl);
        data = await fetchFromEndpoint(fullUrl.toString());
        usedFallback = true;
        
        if (!validateGeoJSON(data)) {
          throw new Error('Both simplified and full GeoJSON failed validation');
        }
      }
      
      const featureCount = data?.features?.length || 0;
      console.log(`[MapScreen] ${layerType} loaded: ${featureCount} features${usedFallback ? ' (using full version fallback)' : ''}`);
      
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
  
  // Handle focus district from navigation params (jump-to-district feature)
  useEffect(() => {
    const focusDistrict = route.params?.focusDistrict;
    if (focusDistrict && mapReady && dataLoaded) {
      console.log('[MapScreen] Focusing on district:', focusDistrict);
      
      // Clear any existing polygon/results
      setStoredPolygon(null);
      setSelectedDistrict(null);
      setShowResultsPanel(false);
      
      // Clear drawing and highlights in WebView
      const clearMsg = { type: 'CLEAR_DRAWING' };
      const clearHighlightsMsg = { type: 'CLEAR_HIGHLIGHTS' };
      if (Platform.OS === 'web') {
        if (iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage(JSON.stringify(clearMsg), '*');
          iframeRef.current.contentWindow.postMessage(JSON.stringify(clearHighlightsMsg), '*');
        }
      } else {
        sendToWebView(clearMsg);
        sendToWebView(clearHighlightsMsg);
      }
      
      // Enable the appropriate overlay if not already enabled
      const layerType = focusDistrict.source === 'TX_HOUSE' ? 'house' : 
                        focusDistrict.source === 'TX_SENATE' ? 'senate' : 'congress';
      if (!overlays[layerType]) {
        const newOverlays = { ...overlays, [layerType]: true };
        setOverlays(newOverlays);
        saveOverlayPreferences(newOverlays);
        
        const toggleMsg = { type: 'toggleLayer', layer: layerType, visible: true };
        if (Platform.OS === 'web') {
          if (iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage(JSON.stringify(toggleMsg), '*');
          }
        } else {
          sendToWebView(toggleMsg);
        }
      }
      
      // Send focus district message to WebView
      const focusMsg = { 
        type: 'FOCUS_DISTRICT', 
        source: focusDistrict.source, 
        districtNumber: focusDistrict.districtNumber 
      };
      if (Platform.OS === 'web') {
        if (iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage(JSON.stringify(focusMsg), '*');
        }
      } else {
        sendToWebView(focusMsg);
      }
      
      setHighlightedDistrict({ source: focusDistrict.source, district: focusDistrict.districtNumber });
      
      // Clear highlight after 3 seconds
      setTimeout(() => {
        setHighlightedDistrict(null);
      }, 3000);
      
      // Clear the navigation params to avoid re-triggering
      navigation.setParams({ focusDistrict: undefined });
    }
  }, [route.params?.focusDistrict, mapReady, dataLoaded, overlays, sendToWebView, navigation]);

  // Filter address dots based on overlay settings
  const filteredAddressDots = useMemo(() => {
    return addressDots.filter(dot => {
      if (dot.source === "OTHER_TX") {
        return true;
      }
      if (dot.source === "TX_HOUSE" && overlays.house) {
        return true;
      }
      if (dot.source === "TX_SENATE" && overlays.senate) {
        return true;
      }
      if (dot.source === "US_HOUSE" && overlays.congress) {
        return true;
      }
      return false;
    });
  }, [addressDots, overlays]);

  // Send filtered address dots to WebView when ready or overlays change
  useEffect(() => {
    if (!mapReady) return;
    
    const dotsMsg = { type: 'SET_ADDRESS_DOTS', dots: filteredAddressDots };
    if (Platform.OS === 'web') {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(JSON.stringify(dotsMsg), '*');
      }
    } else {
      sendToWebView(dotsMsg);
    }
    console.log('[MapScreen] Sent', filteredAddressDots.length, 'filtered address dots to WebView (of', addressDots.length, 'total)');
  }, [mapReady, filteredAddressDots, addressDots.length, sendToWebView]);

  // Update active officials when selectedDistrict changes
  useEffect(() => {
    const activeIds = selectedDistrict?.officials?.map(o => o.id) || [];
    
    const activeMsg = { type: 'SET_ACTIVE_OFFICIALS', officialIds: activeIds };
    if (Platform.OS === 'web') {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(JSON.stringify(activeMsg), '*');
      }
    } else {
      sendToWebView(activeMsg);
    }
  }, [selectedDistrict?.officials, sendToWebView]);

  const handleToggleOverlay = useCallback(
    async (type: keyof OverlayPreferences) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const newValue = !overlays[type];
      const newOverlays = { ...overlays, [type]: newValue };
      
      if (DEBUG_MAP) {
        console.log(`[MapScreen] Overlay change: ${type} ${overlays[type]} -> ${newValue}`);
        console.log(`[MapScreen] Overlays before:`, overlays, `after:`, newOverlays);
      }
      
      // Check if any highlights exist
      const hasHighlights = highlightsByLayer.tx_house !== null || 
                           highlightsByLayer.tx_senate !== null || 
                           highlightsByLayer.us_congress !== null;
      
      // Clear all highlights when overlay changes to avoid stale selections
      if (hasHighlights) {
        if (DEBUG_MAP) {
          console.log(`[MapScreen] Cleared highlights due to overlay change:`, highlightsByLayer);
        }
        setHighlightsByLayer({ tx_house: null, tx_senate: null, us_congress: null });
        setSelectedDistrict(null);
        setShowResultsPanel(false);
        
        // Send CLEAR_HIGHLIGHTS to WebView
        const clearMsg = { type: 'CLEAR_HIGHLIGHTS' };
        if (Platform.OS === 'web') {
          if (iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage(JSON.stringify(clearMsg), '*');
          }
        } else {
          sendToWebView(clearMsg);
        }
      }
      
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
    [overlays, sendToWebView, highlightsByLayer, DEBUG_MAP]
  );

  // Helper to normalize a hit to canonical format
  // Accepts either native schema (source/districtNumber) or web schema (type/district)
  const normalizeHit = useCallback((hit: DistrictHit | { type?: string; district?: number }): { layerType: string; districtNumber: number } => {
    // Handle source (native schema) or type (web schema)
    let layerType: string;
    const rawHit = hit as { source?: string; districtNumber?: number; type?: string; district?: number };
    
    if (rawHit.source) {
      layerType = rawHit.source === 'TX_HOUSE' ? 'tx_house' : 
                  rawHit.source === 'TX_SENATE' ? 'tx_senate' : 'us_congress';
    } else if (rawHit.type) {
      layerType = rawHit.type;
    } else {
      layerType = 'unknown';
    }
    
    // Handle districtNumber (native) or district (web)
    const districtNumber = rawHit.districtNumber ?? rawHit.district ?? 0;
    
    return { layerType, districtNumber };
  }, []);
  

  // Helper to convert highlightsByLayer to array of hits for API/WebView
  const highlightsToHits = useCallback((highlights: HighlightsByLayer): DistrictHit[] => {
    const hits: DistrictHit[] = [];
    if (highlights.tx_house !== null) {
      hits.push({ source: 'TX_HOUSE' as SourceType, districtNumber: highlights.tx_house });
    }
    if (highlights.tx_senate !== null) {
      hits.push({ source: 'TX_SENATE' as SourceType, districtNumber: highlights.tx_senate });
    }
    if (highlights.us_congress !== null) {
      hits.push({ source: 'US_HOUSE' as SourceType, districtNumber: highlights.us_congress });
    }
    return hits;
  }, []);
  
  // Helper to convert highlightsByLayer to web schema for WebView messaging
  const highlightsToWebHits = useCallback((highlights: HighlightsByLayer): { type: string; district: number }[] => {
    const hits: { type: string; district: number }[] = [];
    if (highlights.tx_house !== null) {
      hits.push({ type: 'tx_house', district: highlights.tx_house });
    }
    if (highlights.tx_senate !== null) {
      hits.push({ type: 'tx_senate', district: highlights.tx_senate });
    }
    if (highlights.us_congress !== null) {
      hits.push({ type: 'us_congress', district: highlights.us_congress });
    }
    return hits;
  }, []);

  const handleMapTap = useCallback(
    async (hits: DistrictHit[]) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      if (DEBUG_MAP) console.log('[MAP_TAP] handleMapTap with', hits.length, 'hits');
      
      // Tap on empty space - clear all highlights
      if (hits.length === 0) {
        if (DEBUG_MAP) console.log('[MAP_TAP] Empty tap, clearing all highlights');
        setHighlightsByLayer({ tx_house: null, tx_senate: null, us_congress: null });
        setSelectedDistrict(null);
        setShowResultsPanel(false);
        
        const clearMsg = { type: 'CLEAR_HIGHLIGHTS' };
        if (Platform.OS === 'web') {
          if (iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage(JSON.stringify(clearMsg), '*');
          }
        } else {
          sendToWebView(clearMsg);
        }
        setStoredPolygon(null);
        return;
      }
      
      // Single-select per overlay: process each hit
      const newHighlights = { ...highlightsByLayer };
      
      for (const hit of hits) {
        const { layerType, districtNumber } = normalizeHit(hit);
        const overlayKey = layerType as keyof HighlightsByLayer;
        
        if (DEBUG_MAP) {
          console.log('[MAP_TAP] Normalized hit:', { layerType, districtNumber });
          console.log('[MAP_TAP] Previous selection for', overlayKey, ':', highlightsByLayer[overlayKey]);
        }
        
        if (highlightsByLayer[overlayKey] === districtNumber) {
          // Same district tapped again - deselect
          newHighlights[overlayKey] = null;
          if (DEBUG_MAP) console.log('[MAP_TAP] Deselecting', overlayKey, districtNumber);
        } else {
          // Different district or first selection - select (replaces any previous)
          newHighlights[overlayKey] = districtNumber;
          if (DEBUG_MAP) console.log('[MAP_TAP] Selecting', overlayKey, districtNumber);
        }
      }
      
      if (DEBUG_MAP) console.log('[MAP_TAP] New selection map:', newHighlights);
      
      // Update state
      setHighlightsByLayer(newHighlights);
      
      // Check if any highlights remain
      const hasHighlights = newHighlights.tx_house !== null || 
                           newHighlights.tx_senate !== null || 
                           newHighlights.us_congress !== null;
      
      if (!hasHighlights) {
        // No highlights - send clear message
        const clearMsg = { type: 'CLEAR_HIGHLIGHTS' };
        if (Platform.OS === 'web') {
          if (iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage(JSON.stringify(clearMsg), '*');
          }
        } else {
          sendToWebView(clearMsg);
        }
        setShowResultsPanel(false);
        setSelectedDistrict(null);
      } else {
        // Convert to web schema hits for WebView messaging
        const webHits = highlightsToWebHits(newHighlights);
        
        const highlightMsg = { type: 'HIGHLIGHT_DISTRICTS', hits: webHits };
        if (DEBUG_MAP) console.log('[MAP_TAP] Sending HIGHLIGHT_DISTRICTS:', webHits);
        
        if (Platform.OS === 'web') {
          if (iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage(JSON.stringify(highlightMsg), '*');
          }
        } else {
          sendToWebView(highlightMsg);
        }
        
        // Convert to DistrictHit format for API calls
        const districtHits = highlightsToHits(newHighlights);
        
        // Fetch officials for all highlighted districts
        const officials = await fetchOfficialsByDistricts(districtHits);
        if (DEBUG_MAP) console.log('[MAP_TAP] Fetched', officials.length, 'officials');
        
        setSelectedDistrict({
          hits: districtHits,
          officials,
        });
        setShowResultsPanel(true);
      }
      
      // Note: Don't clear storedPolygon on tap - let it persist so user can restore polygon results
    },
    [fetchOfficialsByDistricts, sendToWebView, highlightsByLayer, normalizeHit, highlightsToHits, highlightsToWebHits, DEBUG_MAP]
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
    setStoredPolygon(null);
    setShowResultsPanel(false);
    
    const msg = { type: 'CLEAR_DRAWING' };
    const clearHighlightsMsg = { type: 'CLEAR_HIGHLIGHTS' };
    if (Platform.OS === 'web') {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(JSON.stringify(msg), '*');
        iframeRef.current.contentWindow.postMessage(JSON.stringify(clearHighlightsMsg), '*');
      }
    } else {
      sendToWebView(msg);
      sendToWebView(clearHighlightsMsg);
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
        setStoredPolygon({ geometry, hits: [], officials: [] });
        setShowResultsPanel(true);
        setDrawLoading(false);
        return;
      }
      
      // Fetch officials using existing pipeline
      const officials = await fetchOfficialsByDistricts(hits);
      console.log('[MapScreen] Draw search officials:', officials.length);
      
      // Store polygon and results for persistence
      setStoredPolygon({ geometry, hits, officials });
      setSelectedDistrict({ hits, officials });
      setShowResultsPanel(true);
      
      // Highlight ALL districts in the polygon (multi-select for draw mode)
      const webHits = hits.map((hit: { source: string; districtNumber: number }) => ({
        type: hit.source === 'TX_HOUSE' ? 'tx_house' : 
              hit.source === 'TX_SENATE' ? 'tx_senate' : 'us_congress',
        district: hit.districtNumber,
      }));
      const highlightMsg = { type: 'HIGHLIGHT_DISTRICTS', hits: webHits };
      console.log('[MapScreen] Highlighting', webHits.length, 'districts from polygon');
      
      if (Platform.OS === 'web') {
        if (iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage(JSON.stringify(highlightMsg), '*');
        }
      } else {
        sendToWebView(highlightMsg);
      }
    } catch (error) {
      console.error('[MapScreen] Draw search error:', error);
    } finally {
      setDrawLoading(false);
    }
  }, [overlays, fetchOfficialsByDistricts, sendToWebView]);

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
    // Hide the results panel and clear all state
    setShowResultsPanel(false);
    setSelectedDistrict(null);
    
    // Clear all highlights (single-select per overlay)
    setHighlightsByLayer({ tx_house: null, tx_senate: null, us_congress: null });
    
    // Clear district highlights on the map
    const clearHighlightsMsg = { type: 'CLEAR_HIGHLIGHTS' };
    if (Platform.OS === 'web') {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(JSON.stringify(clearHighlightsMsg), '*');
      }
    } else {
      sendToWebView(clearHighlightsMsg);
    }
  }, [sendToWebView]);
  
  // Restore stored polygon results when tapping the chip
  const handleRestorePolygonResults = useCallback(() => {
    if (storedPolygon) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSelectedDistrict({
        hits: storedPolygon.hits,
        officials: storedPolygon.officials,
      });
      setShowResultsPanel(true);
      
      // Re-highlight all districts from the stored polygon
      const webHits = storedPolygon.hits.map((hit: { source: string; districtNumber: number }) => ({
        type: hit.source === 'TX_HOUSE' ? 'tx_house' : 
              hit.source === 'TX_SENATE' ? 'tx_senate' : 'us_congress',
        district: hit.districtNumber,
      }));
      const highlightMsg = { type: 'HIGHLIGHT_DISTRICTS', hits: webHits };
      
      if (Platform.OS === 'web') {
        if (iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage(JSON.stringify(highlightMsg), '*');
        }
      } else {
        sendToWebView(highlightMsg);
      }
    }
  }, [storedPolygon, sendToWebView]);

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
        // Auto-disable draw mode after completing a drawing
        setDrawModeActive(false);
        sendToWebView({ type: 'SET_DRAW_MODE', enabled: false });
      } else if (data.type === "DRAW_CLEARED") {
        console.log('[MapScreen] DRAW_CLEARED received');
        setSelectedDistrict(null);
      } else if (data.type === "addressDotClicked" && data.officialId) {
        console.log('[MapScreen] Address dot clicked:', data.officialId);
        // Navigate to the official's profile, PRIVATE tab
        navigation.navigate("OfficialProfile", { 
          officialId: data.officialId,
          initialTab: "private"
        });
      }
    } catch (error) {
      console.error("[MapScreen] Error parsing WebView message:", error);
    }
  }, [handleMapTap, handleDrawComplete, navigation]);
  
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
          if ((data.type === "MAP_TAP" || data.type === "mapTap") && Array.isArray(data.hits)) {
            console.log('[MapScreen] Window MAP_TAP hits:', data.hits.length, 'raw hits:', JSON.stringify(data.hits));
            handleMapTap(data.hits);
          } else if (data.type === "mapReady") {
            console.log('[MapScreen] Map is ready (from window)!');
            setMapReady(true);
          } else if (data.type === "DRAW_COMPLETE" && data.geometry) {
            console.log('[MapScreen] Window DRAW_COMPLETE received');
            handleDrawComplete(data.geometry);
            // Auto-disable draw mode after completing a drawing
            setDrawModeActive(false);
            if (iframeRef.current?.contentWindow) {
              iframeRef.current.contentWindow.postMessage(JSON.stringify({ type: 'SET_DRAW_MODE', enabled: false }), '*');
            }
          } else if (data.type === "DRAW_CLEARED") {
            console.log('[MapScreen] Window DRAW_CLEARED received');
            setSelectedDistrict(null);
          } else if (data.type === "addressDotClicked" && data.officialId) {
            console.log('[MapScreen] Window Address dot clicked:', data.officialId);
            navigation.navigate("OfficialProfile", { 
              officialId: data.officialId,
              initialTab: "private"
            });
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
  const [mapBlobUrl, setMapBlobUrl] = useState<string | null>(null);
  
  useEffect(() => {
    if (Platform.OS === 'web') {
      const blob = new Blob([MAP_HTML], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      setMapBlobUrl(url);
      return () => {
        URL.revokeObjectURL(url);
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
          src={`${getApiUrl()}/api/map.html`}
          style={{ 
            flex: 1, 
            width: '100%', 
            height: '100%', 
            border: 'none',
          }}
          title="Texas Districts Map"
          allow="geolocation"
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

      {/* Clear drawing button - only show when there's a stored polygon */}
      {storedPolygon ? (
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
      
      {/* Restore results chip - show when there's a stored polygon AND panel is hidden */}
      {storedPolygon && storedPolygon.officials.length > 0 && !showResultsPanel ? (
        <Pressable
          onPress={handleRestorePolygonResults}
          style={[
            styles.restoreChip,
            {
              top: headerHeight + Spacing.sm + 52, // Below locate button
              backgroundColor: theme.primary,
            },
            Shadows.md,
          ]}
        >
          <Feather name="map-pin" size={14} color="#FFFFFF" />
          <ThemedText style={styles.restoreChipText}>
            {storedPolygon.officials.length} Officials
          </ThemedText>
        </Pressable>
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

      {showResultsPanel && selectedDistrict ? (
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
  restoreChip: {
    position: "absolute",
    left: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    gap: 4,
    zIndex: 2000,
    elevation: 200,
  },
  restoreChipText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
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
