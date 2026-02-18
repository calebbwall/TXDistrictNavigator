import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { txHouseGeoJSON, txSenateGeoJSON, usCongressGeoJSON, txHouseGeoJSONFull, txSenateGeoJSONFull, usCongressGeoJSONFull } from "./data/geojson";
import { db } from "./db";
import { registerPrayerRoutes } from "./routes/prayerRoutes";
import { 
  officialPublic, 
  officialPrivate, 
  refreshJobLog,
  updateOfficialPrivateSchema,
  DISTRICT_RANGES,
  type MergedOfficial,
  type OfficialPublic,
  type OfficialPrivate 
} from "@shared/schema";
import { desc } from "drizzle-orm";
import { eq, and, sql, or, ilike, inArray, isNull } from "drizzle-orm";
import * as turf from "@turf/turf";
import booleanIntersects from "@turf/boolean-intersects";
import type { Feature, FeatureCollection, Polygon } from "geojson";

type SourceType = "TX_HOUSE" | "TX_SENATE" | "US_HOUSE" | "OTHER_TX";
type DistrictSourceType = "TX_HOUSE" | "TX_SENATE" | "US_HOUSE";

// Generate map HTML for iframe embedding
function getMapHtml(): string {
  return `<!DOCTYPE html>
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
      background: #007AFF;
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    }
    .address-dot-marker {
      background: #9B59B6;
      border: 2px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }
    .cluster-badge {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      font-weight: bold;
      color: white;
      background: #7B68EE;
      border-radius: 50%;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    }
    .headshot-marker {
      display: flex;
      flex-direction: column;
      align-items: center;
      pointer-events: auto;
    }
    .headshot-bubble {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: white;
      border: 2.5px solid rgba(0,0,0,0.15);
      overflow: hidden;
      box-shadow: 0 3px 8px rgba(0,0,0,0.3);
    }
    .headshot-bubble img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .headshot-initials {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 16px;
      color: #555;
      background: #e8e8e8;
    }
    .headshot-tail {
      width: 0;
      height: 0;
      border-left: 7px solid transparent;
      border-right: 7px solid transparent;
      border-top: 10px solid white;
      margin-top: -2px;
      filter: drop-shadow(0 2px 2px rgba(0,0,0,0.15));
    }
    .headshot-overflow {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .headshot-overflow-bubble {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: rgba(74, 144, 226, 0.9);
      border: 2.5px solid white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
      color: white;
      box-shadow: 0 3px 8px rgba(0,0,0,0.3);
      cursor: pointer;
    }
    .headshot-overflow-tail {
      width: 0;
      height: 0;
      border-left: 7px solid transparent;
      border-right: 7px solid transparent;
      border-top: 10px solid rgba(74, 144, 226, 0.9);
      margin-top: -2px;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', {
      center: [31.0, -100.0],
      zoom: 6,
      zoomControl: true,
      attributionControl: false
    });
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18
    }).addTo(map);
    
    var layers = { senate: null, house: null, congress: null };
    var highlightLayers = []; // Array of all highlight layers for multi-select support
    var geoJSONData = { tx_senate: null, tx_house: null, us_congress: null };
    var enabledLayers = { senate: true, house: true, congress: false };
    var locationMarker = null;
    var drawnPolygon = null;
    var polyline = null;
    var drawPoints = [];
    var addressDotMarkers = [];
    var addressDotsByCity = {};
    
    var loadStatus = {
      tx_senate: { loaded: false, loading: false, features: 0, error: null },
      tx_house: { loaded: false, loading: false, features: 0, error: null },
      us_congress: { loaded: false, loading: false, features: 0, error: null }
    };
    
    var layerColors = {
      tx_senate: { fill: '#4B79A1', stroke: '#4B79A1', fillOpacity: 0.15, weight: 3 },
      tx_house: { fill: '#55BB69', stroke: '#55BB69', fillOpacity: 0.15, weight: 3 },
      us_congress: { fill: '#8B4513', stroke: '#8B4513', fillOpacity: 0.15, weight: 3 }
    };
    
    function postMessage(data) {
      try {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify(data));
        } else if (window.parent !== window) {
          // Use '*' to allow cross-origin communication since parent may be on different port
          window.parent.postMessage(JSON.stringify(data), '*');
        }
      } catch (e) {
        console.error('[Leaflet] postMessage error:', e);
      }
    }
    
    function createLayer(type, data, colors) {
      var layer = L.geoJSON(data, {
        style: {
          color: colors.stroke,
          weight: colors.weight || 3,
          fillColor: colors.fill,
          fillOpacity: colors.fillOpacity || 0.15,
          opacity: 0.8
        }
      });
      return layer;
    }
    
    async function fetchAndSetGeoJSON(layerType) {
      if (loadStatus[layerType].loaded || loadStatus[layerType].loading) {
        console.log('[OVERLAY]', layerType, 'already loaded or loading');
        return loadStatus[layerType].loaded;
      }
      
      loadStatus[layerType].loading = true;
      console.log('[OVERLAY]', layerType, 'fetching from /api/geojson/' + layerType);
      
      try {
        var response = await fetch('/api/geojson/' + layerType);
        console.log('[OVERLAY]', layerType, 'status=' + response.status);
        
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        
        var data = await response.json();
        var featureCount = data.features?.length || 0;
        console.log('[OVERLAY]', layerType, 'features=' + featureCount);
        
        geoJSONData[layerType] = data;
        loadStatus[layerType].loaded = true;
        loadStatus[layerType].features = featureCount;
        loadStatus[layerType].loading = false;
        
        var typeKey = layerType === 'tx_senate' ? 'senate' : 
                      layerType === 'tx_house' ? 'house' : 'congress';
        if (layers[typeKey]) {
          map.removeLayer(layers[typeKey]);
        }
        layers[typeKey] = createLayer(typeKey, data, layerColors[layerType]);
        
        if (enabledLayers[typeKey] && layers[typeKey]) {
          layers[typeKey].addTo(map);
          layers[typeKey].bringToFront();
          console.log('[OVERLAY]', layerType, 'auto-added to map (enabled)');
        }
        
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
    
    window.toggleLayer = function(type, visible) {
      console.log('[OVERLAY] toggleLayer:', type, 'visible=', visible);
      enabledLayers[type] = visible;
      var layerType = type === 'senate' ? 'tx_senate' : 
                      type === 'house' ? 'tx_house' : 'us_congress';
      var layer = layers[type];
      
      if (!layer && visible && geoJSONData[layerType]) {
        layer = createLayer(type, geoJSONData[layerType], layerColors[layerType]);
        layers[type] = layer;
      }
      
      if (layer) {
        if (visible) {
          layer.addTo(map);
          layer.bringToFront();
          console.log('[OVERLAY]', type, 'added to map');
        } else {
          map.removeLayer(layer);
          console.log('[OVERLAY]', type, 'removed from map');
        }
      } else {
        console.log('[OVERLAY]', type, 'layer not found or not loaded');
      }
    };
    
    function pointInPolygon(lat, lng, polygon) {
      var x = lng, y = lat;
      var inside = false;
      for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        var xi = polygon[i][0], yi = polygon[i][1];
        var xj = polygon[j][0], yj = polygon[j][1];
        var intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    }
    
    function isPointInGeoJSONFeature(lat, lng, feature) {
      if (!feature.geometry) return false;
      if (feature.geometry.type === 'Polygon') {
        var rings = feature.geometry.coordinates;
        var inOuter = pointInPolygon(lat, lng, rings[0]);
        if (!inOuter) return false;
        for (var h = 1; h < rings.length; h++) {
          if (pointInPolygon(lat, lng, rings[h])) return false;
        }
        return true;
      } else if (feature.geometry.type === 'MultiPolygon') {
        for (var p = 0; p < feature.geometry.coordinates.length; p++) {
          var polyRings = feature.geometry.coordinates[p];
          var inOuterPoly = pointInPolygon(lat, lng, polyRings[0]);
          if (inOuterPoly) {
            var inHole = false;
            for (var hIdx = 1; hIdx < polyRings.length; hIdx++) {
              if (pointInPolygon(lat, lng, polyRings[hIdx])) { inHole = true; break; }
            }
            if (!inHole) return true;
          }
        }
        return false;
      }
      return false;
    }
    
    map.on('click', function(e) {
      console.log('[MAP_TAP] Click at', e.latlng.lat, e.latlng.lng);
      console.log('[MAP_TAP] Enabled layers:', JSON.stringify(enabledLayers));
      
      var hits = [];
      var layerMap = { senate: 'tx_senate', house: 'tx_house', congress: 'us_congress' };
      
      for (var key in enabledLayers) {
        if (!enabledLayers[key]) continue;
        var dataKey = layerMap[key];
        var geojson = geoJSONData[dataKey];
        if (!geojson || !geojson.features) {
          console.log('[MAP_TAP]', dataKey, 'no data loaded');
          continue;
        }
        
        for (var i = 0; i < geojson.features.length; i++) {
          var feat = geojson.features[i];
          if (isPointInGeoJSONFeature(e.latlng.lat, e.latlng.lng, feat)) {
            var distNum = feat.properties.DIST_NBR || feat.properties.district;
            hits.push({
              type: dataKey,
              district: parseInt(distNum) || 0,
              properties: feat.properties
            });
          }
        }
      }
      
      console.log('[MAP_TAP] Total hits:', hits.length);
      postMessage({
        type: 'mapTap',
        lat: e.latlng.lat,
        lng: e.latlng.lng,
        hits: hits
      });
    });
    
    window.highlightDistricts = function(hits) {
      console.log('[Leaflet] highlightDistricts called with', hits.length, 'hits');
      
      // Clear all existing highlight layers
      for (var k = 0; k < highlightLayers.length; k++) {
        map.removeLayer(highlightLayers[k]);
      }
      highlightLayers = [];
      
      var layerMap = { senate: 'tx_senate', house: 'tx_house', congress: 'us_congress' };
      for (var i = 0; i < hits.length; i++) {
        var hit = hits[i];
        // Support both districtNumber (native) and district (web) keys
        var districtNumber = hit.districtNumber !== undefined ? hit.districtNumber : hit.district;
        // Support both source (native) and type (web) keys
        var layerType = hit.type;
        if (hit.source) {
          layerType = hit.source === 'TX_HOUSE' ? 'tx_house' : 
                      hit.source === 'TX_SENATE' ? 'tx_senate' : 'us_congress';
        }
        
        var typeKey = layerType === 'tx_senate' ? 'senate' : 
                      layerType === 'tx_house' ? 'house' : 'congress';
        var dataKey = layerMap[typeKey];
        var geojson = geoJSONData[dataKey];
        if (!geojson) continue;
        
        for (var j = 0; j < geojson.features.length; j++) {
          var feat = geojson.features[j];
          var distNum = parseInt(feat.properties.DIST_NBR || feat.properties.district) || 0;
          if (distNum === districtNumber) {
            var colors = layerColors[dataKey];
            var hl = L.geoJSON(feat, {
              style: {
                color: colors.stroke,
                weight: 5,
                fillColor: colors.fill,
                fillOpacity: 0.4,
                opacity: 1
              }
            });
            hl.addTo(map);
            highlightLayers.push(hl);
            break;
          }
        }
      }
      console.log('[Leaflet] Highlighted', highlightLayers.length, 'districts');
    };
    
    window.clearHighlights = function() {
      console.log('[Leaflet] clearHighlights called, current layers:', highlightLayers.length);
      for (var k = 0; k < highlightLayers.length; k++) {
        map.removeLayer(highlightLayers[k]);
      }
      highlightLayers = [];
    };
    
    window.setUserLocation = function(lat, lng) {
      if (locationMarker) {
        map.removeLayer(locationMarker);
      }
      var icon = L.divIcon({
        className: 'user-location-marker',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });
      locationMarker = L.marker([lat, lng], { icon: icon }).addTo(map);
    };
    
    window.centerMap = function(lat, lng, zoom) {
      map.setView([lat, lng], zoom || 10);
    };
    
    window.focusDistrict = function(type, districtNum) {
      var dataKey = type === 'senate' ? 'tx_senate' : 
                    type === 'house' ? 'tx_house' : 'us_congress';
      var geojson = geoJSONData[dataKey];
      if (!geojson) return;
      
      for (var i = 0; i < geojson.features.length; i++) {
        var feat = geojson.features[i];
        var distNum = parseInt(feat.properties.DIST_NBR || feat.properties.district) || 0;
        if (distNum === districtNum) {
          var layer = L.geoJSON(feat);
          var bounds = layer.getBounds();
          map.fitBounds(bounds, { padding: [50, 50] });
          
          var colors = layerColors[dataKey];
          window.clearHighlights();
          var hl = L.geoJSON(feat, {
            style: { color: colors.stroke, weight: 5, fillColor: colors.fill, fillOpacity: 0.4, opacity: 1 }
          });
          hl.addTo(map);
          highlightLayers.push(hl);
          break;
        }
      }
    };
    
    window.setAddressDots = function(dots) {
      for (var i = 0; i < addressDotMarkers.length; i++) {
        map.removeLayer(addressDotMarkers[i]);
      }
      addressDotMarkers = [];
      addressDotsByCity = {};
      
      for (var j = 0; j < dots.length; j++) {
        var dot = dots[j];
        var cityKey = dot.lat.toFixed(2) + ',' + dot.lng.toFixed(2);
        if (!addressDotsByCity[cityKey]) {
          addressDotsByCity[cityKey] = [];
        }
        addressDotsByCity[cityKey].push(dot);
      }
      
      for (var key in addressDotsByCity) {
        var cluster = addressDotsByCity[key];
        var first = cluster[0];
        var icon;
        if (cluster.length > 1) {
          icon = L.divIcon({
            className: 'cluster-badge',
            html: '<span>' + cluster.length + '</span>',
            iconSize: [22, 22],
            iconAnchor: [11, 11]
          });
        } else {
          icon = L.divIcon({
            className: 'address-dot-marker',
            iconSize: [12, 12],
            iconAnchor: [6, 6]
          });
        }
        var marker = L.marker([first.lat, first.lng], { icon: icon });
        marker.clusterData = cluster;
        marker.on('click', function(e) {
          L.DomEvent.stopPropagation(e);
          postMessage({
            type: 'addressDotClick',
            officials: this.clusterData
          });
        });
        marker.addTo(map);
        addressDotMarkers.push(marker);
      }
    };
    
    window.setActiveAddressDot = function(id) {
      // Optional: highlight active dot
    };
    
    var headshotMarkers = [];
    var centroidCache = {};
    var featureCache = {};
    var boundaryCache = {};
    
    function computeCentroid(feature) {
      if (!feature || !feature.geometry) return null;
      var coords = [];
      function extractCoords(geom) {
        if (geom.type === 'Polygon') {
          for (var i = 0; i < geom.coordinates[0].length; i++) {
            coords.push(geom.coordinates[0][i]);
          }
        } else if (geom.type === 'MultiPolygon') {
          var bestArea = 0;
          var bestIdx = 0;
          for (var p = 0; p < geom.coordinates.length; p++) {
            var ring = geom.coordinates[p][0];
            var area = 0;
            for (var a = 0; a < ring.length - 1; a++) {
              area += ring[a][0] * ring[a+1][1] - ring[a+1][0] * ring[a][1];
            }
            area = Math.abs(area) / 2;
            if (area > bestArea) { bestArea = area; bestIdx = p; }
          }
          var best = geom.coordinates[bestIdx][0];
          for (var b = 0; b < best.length; b++) {
            coords.push(best[b]);
          }
        }
      }
      extractCoords(feature.geometry);
      if (coords.length === 0) return null;
      var sumLat = 0, sumLng = 0;
      for (var c = 0; c < coords.length; c++) {
        sumLng += coords[c][0];
        sumLat += coords[c][1];
      }
      return [sumLat / coords.length, sumLng / coords.length];
    }
    
    function getDistrictFeature(layerType, districtNum) {
      var key = layerType + '_' + districtNum;
      if (featureCache[key]) return featureCache[key];
      var geojson = geoJSONData[layerType];
      if (!geojson || !geojson.features) return null;
      for (var i = 0; i < geojson.features.length; i++) {
        var feat = geojson.features[i];
        var dn = parseInt(feat.properties.DIST_NBR || feat.properties.district) || 0;
        if (dn === districtNum) {
          featureCache[key] = feat;
          return feat;
        }
      }
      return null;
    }
    
    function getDistrictCentroid(layerType, districtNum) {
      var key = layerType + '_' + districtNum;
      if (centroidCache[key]) return centroidCache[key];
      var feat = getDistrictFeature(layerType, districtNum);
      if (!feat) return null;
      var c = computeCentroid(feat);
      if (c) centroidCache[key] = c;
      return c;
    }
    
    function getInitials(name) {
      if (!name) return '?';
      var parts = name.trim().split(/\\s+/);
      if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
      return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }
    
    function getBoundaryRings(feature) {
      var rings = [];
      if (feature.geometry.type === 'Polygon') {
        rings.push(feature.geometry.coordinates[0]);
      } else if (feature.geometry.type === 'MultiPolygon') {
        for (var p = 0; p < feature.geometry.coordinates.length; p++) {
          rings.push(feature.geometry.coordinates[p][0]);
        }
      }
      return rings;
    }
    
    function nearestPointOnSegment(px, py, ax, ay, bx, by) {
      var dx = bx - ax, dy = by - ay;
      var lenSq = dx * dx + dy * dy;
      if (lenSq === 0) return { x: ax, y: ay, dist: Math.sqrt((px-ax)*(px-ax)+(py-ay)*(py-ay)) };
      var t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      var nx = ax + t * dx, ny = ay + t * dy;
      var d = Math.sqrt((px-nx)*(px-nx)+(py-ny)*(py-ny));
      return { x: nx, y: ny, dist: d };
    }
    
    function nearestPointOnBoundary(lat, lng, feature) {
      var cacheKey = (feature.properties.DIST_NBR || feature.properties.district || '') + '_' + feature.geometry.type;
      var rings = boundaryCache[cacheKey] || getBoundaryRings(feature);
      if (!boundaryCache[cacheKey]) boundaryCache[cacheKey] = rings;
      var bestDist = Infinity, bestX = 0, bestY = 0;
      for (var r = 0; r < rings.length; r++) {
        var ring = rings[r];
        for (var i = 0; i < ring.length - 1; i++) {
          var res = nearestPointOnSegment(lng, lat, ring[i][0], ring[i][1], ring[i+1][0], ring[i+1][1]);
          if (res.dist < bestDist) {
            bestDist = res.dist;
            bestX = res.x;
            bestY = res.y;
          }
        }
      }
      return [bestY, bestX];
    }
    
    function closestPointInsidePolygon(lat, lng, feature) {
      if (isPointInGeoJSONFeature(lat, lng, feature)) return [lat, lng];
      var nearest = nearestPointOnBoundary(lat, lng, feature);
      var c = computeCentroid(feature);
      if (!c) return nearest;
      var step = 0.00015;
      var candLat = nearest[0], candLng = nearest[1];
      for (var j = 0; j < 25; j++) {
        var dx = c[1] - candLng;
        var dy = c[0] - candLat;
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        candLat = candLat + (dy / len) * step;
        candLng = candLng + (dx / len) * step;
        if (isPointInGeoJSONFeature(candLat, candLng, feature)) return [candLat, candLng];
      }
      return c;
    }
    
    function getMarkerPosition(originLat, originLng, layerType, districtNum) {
      var feature = getDistrictFeature(layerType, districtNum);
      if (!feature) return getDistrictCentroid(layerType, districtNum);
      return closestPointInsidePolygon(originLat, originLng, feature);
    }

    var polylabelCache = {};

    function getFeatureBbox(feature) {
      var minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
      var rings = getBoundaryRings(feature);
      for (var r = 0; r < rings.length; r++) {
        for (var i = 0; i < rings[r].length; i++) {
          var coord = rings[r][i];
          if (coord[0] < minLng) minLng = coord[0];
          if (coord[0] > maxLng) maxLng = coord[0];
          if (coord[1] < minLat) minLat = coord[1];
          if (coord[1] > maxLat) maxLat = coord[1];
        }
      }
      return [minLng, minLat, maxLng, maxLat];
    }

    function distanceToPolygonBorderServer(lat, lng, feature) {
      var nearest = nearestPointOnBoundary(lat, lng, feature);
      var dx = lng - nearest[1];
      var dy = lat - nearest[0];
      return Math.sqrt(dx * dx + dy * dy);
    }

    function getPolylabelServer(feature) {
      var rings = getBoundaryRings(feature);
      if (!rings || rings.length === 0) return computeCentroid(feature);
      var bb = getFeatureBbox(feature);
      var bestPoint = null;
      var bestDist = -Infinity;

      var centroid = computeCentroid(feature);
      if (centroid && isPointInGeoJSONFeature(centroid[0], centroid[1], feature)) {
        bestDist = distanceToPolygonBorderServer(centroid[0], centroid[1], feature);
        bestPoint = [centroid[0], centroid[1]];
      }

      var cellW = (bb[2] - bb[0]);
      var cellH = (bb[3] - bb[1]);

      for (var pass = 0; pass < 3; pass++) {
        var gridSize = pass === 0 ? 10 : 8;
        var sMinLng, sMinLat, sMaxLng, sMaxLat;
        if (pass === 0 || !bestPoint) {
          sMinLng = bb[0]; sMinLat = bb[1]; sMaxLng = bb[2]; sMaxLat = bb[3];
        } else {
          var refW = cellW / Math.pow(gridSize, pass);
          var refH = cellH / Math.pow(gridSize, pass);
          sMinLng = bestPoint[1] - refW; sMinLat = bestPoint[0] - refH;
          sMaxLng = bestPoint[1] + refW; sMaxLat = bestPoint[0] + refH;
        }
        for (var gi = 0; gi < gridSize; gi++) {
          for (var gj = 0; gj < gridSize; gj++) {
            var pLng = sMinLng + ((gi + 0.5) / gridSize) * (sMaxLng - sMinLng);
            var pLat = sMinLat + ((gj + 0.5) / gridSize) * (sMaxLat - sMinLat);
            if (isPointInGeoJSONFeature(pLat, pLng, feature)) {
              var d = distanceToPolygonBorderServer(pLat, pLng, feature);
              if (d > bestDist) { bestDist = d; bestPoint = [pLat, pLng]; }
            }
          }
        }
      }
      return bestPoint || centroid;
    }

    function getDistrictPolylabelServer(layerType, districtNum) {
      var cacheKey = layerType + '_' + districtNum;
      if (polylabelCache[cacheKey]) return polylabelCache[cacheKey];
      var feature = getDistrictFeature(layerType, districtNum);
      if (!feature) return getDistrictCentroid(layerType, districtNum);
      var result = getPolylabelServer(feature);
      if (result) polylabelCache[cacheKey] = result;
      return result;
    }

    function getSafeInsetThresholdServer(feature) {
      var bb = getFeatureBbox(feature);
      var diagLng = bb[2] - bb[0];
      var diagLat = bb[3] - bb[1];
      var diag = Math.sqrt(diagLng * diagLng + diagLat * diagLat);
      var threshold = diag * 0.015;
      var minT = 0.001;
      var maxT = 0.01;
      return Math.max(minT, Math.min(maxT, threshold));
    }

    function pushPointTowardInteriorServer(lat, lng, feature, targetDist, hintLat, hintLng) {
      var curLat = lat, curLng = lng;
      for (var iter = 0; iter < 30; iter++) {
        if (!isPointInGeoJSONFeature(curLat, curLng, feature)) {
          curLat = (curLat + hintLat) / 2;
          curLng = (curLng + hintLng) / 2;
          continue;
        }
        var d = distanceToPolygonBorderServer(curLat, curLng, feature);
        if (d >= targetDist) return [curLat, curLng];
        var dx = hintLng - curLng;
        var dy = hintLat - curLat;
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        var step = Math.max(0.0002, (targetDist - d) * 0.5);
        curLat = curLat + (dy / len) * step;
        curLng = curLng + (dx / len) * step;
      }
      if (isPointInGeoJSONFeature(curLat, curLng, feature)) return [curLat, curLng];
      return [hintLat, hintLng];
    }

    function getBorderSafeBasePointServer(desLat, desLng, feature, layerType, districtNum) {
      var polylabel = getDistrictPolylabelServer(layerType, districtNum);
      if (!polylabel) return [desLat, desLng];
      var safeThreshold = getSafeInsetThresholdServer(feature);

      if (isPointInGeoJSONFeature(desLat, desLng, feature)) {
        var d = distanceToPolygonBorderServer(desLat, desLng, feature);
        if (d >= safeThreshold) return [desLat, desLng];
        return pushPointTowardInteriorServer(desLat, desLng, feature, safeThreshold, polylabel[0], polylabel[1]);
      }

      var nearest = nearestPointOnBoundary(desLat, desLng, feature);
      var pushed = pushPointTowardInteriorServer(nearest[0], nearest[1], feature, safeThreshold, polylabel[0], polylabel[1]);
      if (isPointInGeoJSONFeature(pushed[0], pushed[1], feature) && distanceToPolygonBorderServer(pushed[0], pushed[1], feature) >= safeThreshold) {
        return pushed;
      }
      return polylabel;
    }

    var anchorCacheServer = {};

    function getBorderSafeAnchorsServer(layerType, districtNum) {
      var cacheKey = layerType + '_' + districtNum;
      if (anchorCacheServer[cacheKey]) return anchorCacheServer[cacheKey];
      var feature = getDistrictFeature(layerType, districtNum);
      if (!feature) return [];
      var polylabel = getDistrictPolylabelServer(layerType, districtNum);
      if (!polylabel) return [];
      var safeThreshold = getSafeInsetThresholdServer(feature);
      var bb = getFeatureBbox(feature);
      var gridSize = 7;
      var candidates = [polylabel];
      for (var gi = 0; gi < gridSize; gi++) {
        for (var gj = 0; gj < gridSize; gj++) {
          var lng = bb[0] + ((gi + 0.5) / gridSize) * (bb[2] - bb[0]);
          var lat = bb[1] + ((gj + 0.5) / gridSize) * (bb[3] - bb[1]);
          if (isPointInGeoJSONFeature(lat, lng, feature)) {
            var d = distanceToPolygonBorderServer(lat, lng, feature);
            if (d >= safeThreshold) candidates.push([lat, lng]);
          }
        }
      }
      var maxAnchors = Math.min(6, Math.max(2, candidates.length));
      var selected = [polylabel];
      while (selected.length < maxAnchors && candidates.length > selected.length) {
        var best = null, bestMinDist = -1;
        for (var ci = 0; ci < candidates.length; ci++) {
          var alreadyUsed = false;
          for (var si = 0; si < selected.length; si++) {
            if (candidates[ci] === selected[si]) { alreadyUsed = true; break; }
          }
          if (alreadyUsed) continue;
          var minDist = Infinity;
          for (var si2 = 0; si2 < selected.length; si2++) {
            var dx = candidates[ci][1] - selected[si2][1];
            var dy = candidates[ci][0] - selected[si2][0];
            var dd = dx * dx + dy * dy;
            if (dd < minDist) minDist = dd;
          }
          if (minDist > bestMinDist) { bestMinDist = minDist; best = candidates[ci]; }
        }
        if (best) selected.push(best);
        else break;
      }
      anchorCacheServer[cacheKey] = selected;
      return selected;
    }

    function distancePointToDrawnPolygonServer(lat, lng, drawnCoords) {
      var ring = drawnCoords[0];
      if (!ring || ring.length < 3) return Infinity;
      if (pointInPolygon(lat, lng, ring)) return 0;
      var minDist = Infinity;
      for (var i = 0; i < ring.length - 1; i++) {
        var res = nearestPointOnSegment(lng, lat, ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1]);
        if (res.dist < minDist) minDist = res.dist;
      }
      return minDist;
    }

    function nearestAnchorToDrawnPolygonServer(anchors, drawnCoords) {
      if (!anchors || anchors.length === 0) return null;
      if (!drawnCoords || !drawnCoords[0]) return anchors[0];
      var bestAnchor = anchors[0];
      var bestDist = Infinity;
      for (var i = 0; i < anchors.length; i++) {
        var d = distancePointToDrawnPolygonServer(anchors[i][0], anchors[i][1], drawnCoords);
        if (d < bestDist) { bestDist = d; bestAnchor = anchors[i]; }
      }
      return bestAnchor;
    }

    var activeMarkerStateServer = null;
    var pixelLayoutTimerServer = null;
    var MIN_PX_SERVER = 64;

    function applyPixelLayoutServer() {
      if (!activeMarkerStateServer || activeMarkerStateServer.entries.length < 2) return;
      var entries = activeMarkerStateServer.entries;
      var leafletMarkers = activeMarkerStateServer.leafletMarkers;

      for (var i = 0; i < entries.length; i++) {
        entries[i].pos = [entries[i].basePos[0], entries[i].basePos[1]];
      }

      for (var i2 = 0; i2 < entries.length; i2++) {
        entries[i2].screenPt = map.latLngToContainerPoint(L.latLng(entries[i2].pos[0], entries[i2].pos[1]));
      }

      var hasOverlap = false;
      for (var ci = 0; ci < entries.length && !hasOverlap; ci++) {
        for (var cj = ci + 1; cj < entries.length && !hasOverlap; cj++) {
          var cdx = entries[ci].screenPt.x - entries[cj].screenPt.x;
          var cdy = entries[ci].screenPt.y - entries[cj].screenPt.y;
          if (Math.sqrt(cdx * cdx + cdy * cdy) < MIN_PX_SERVER) hasOverlap = true;
        }
      }

      if (!hasOverlap) {
        for (var ui = 0; ui < entries.length; ui++) {
          if (leafletMarkers[ui]) leafletMarkers[ui].setLatLng(entries[ui].pos);
        }
        return;
      }

      var centerPx = { x: 0, y: 0 };
      for (var ai = 0; ai < entries.length; ai++) {
        centerPx.x += entries[ai].screenPt.x;
        centerPx.y += entries[ai].screenPt.y;
      }
      centerPx.x /= entries.length;
      centerPx.y /= entries.length;

      var radiiPx = [0, 70, 100, 140, 180, 220, 260, 300];
      var anglesPerRing = 12;
      var placed = [];

      for (var idx = 0; idx < entries.length; idx++) {
        var entry = entries[idx];
        var found = false;
        for (var ri = 0; ri < radiiPx.length && !found; ri++) {
          var radius = radiiPx[ri];
          var numAngles = radius === 0 ? 1 : anglesPerRing;
          for (var aii = 0; aii < numAngles && !found; aii++) {
            var angle = -Math.PI / 2 + (2 * Math.PI * aii / numAngles);
            if (radius === 0 && idx > 0) break;
            var candPx = { x: centerPx.x + radius * Math.cos(angle), y: centerPx.y + radius * Math.sin(angle) };
            var candLatLng = map.containerPointToLatLng(L.point(candPx.x, candPx.y));
            var candLat = candLatLng.lat, candLng = candLatLng.lng;
            if (entry.feature && !isPointInGeoJSONFeature(candLat, candLng, entry.feature)) continue;
            if (entry.feature) {
              var bDist = distanceToPolygonBorderServer(candLat, candLng, entry.feature);
              var sThreshold = getSafeInsetThresholdServer(entry.feature);
              if (bDist < sThreshold * 0.25) continue;
            }
            var finalPx = map.latLngToContainerPoint(L.latLng(candLat, candLng));
            var tooClose = false;
            for (var pi = 0; pi < placed.length; pi++) {
              var pPx = entries[placed[pi]].screenPt;
              var pdx = finalPx.x - pPx.x;
              var pdy = finalPx.y - pPx.y;
              if (Math.sqrt(pdx * pdx + pdy * pdy) < MIN_PX_SERVER) { tooClose = true; break; }
            }
            if (!tooClose) {
              entry.pos = [candLat, candLng];
              entry.screenPt = finalPx;
              placed.push(idx);
              found = true;
            }
          }
        }
        if (!found) placed.push(idx);
      }

      for (var fi = 0; fi < entries.length; fi++) {
        if (leafletMarkers[fi]) leafletMarkers[fi].setLatLng(entries[fi].pos);
      }
      console.log('[HEADSHOTS] Pixel layout applied at zoom ' + map.getZoom());
    }

    map.on('moveend', function() {
      if (!activeMarkerStateServer || activeMarkerStateServer.entries.length < 2) return;
      if (pixelLayoutTimerServer) clearTimeout(pixelLayoutTimerServer);
      pixelLayoutTimerServer = setTimeout(function() {
        applyPixelLayoutServer();
      }, 100);
    });
    
    window.setHeadshotMarkers = function(markers, selectionOrigin, selectionMode, drawnPolygon) {
      window.clearHeadshotMarkers();
      activeMarkerStateServer = null;
      var mode = selectionMode || null;
      var MAX_VISIBLE = 10;
      var visible = markers.slice(0, MAX_VISIBLE);
      var overflow = markers.length - MAX_VISIBLE;
      var hasOrigin = selectionOrigin && typeof selectionOrigin.lat === 'number';
      var isDraw = mode === 'draw';
      var hasDrawnPoly = drawnPolygon && drawnPolygon.coordinates && drawnPolygon.coordinates[0];

      var entries = [];
      for (var i = 0; i < visible.length; i++) {
        var m = visible[i];
        var feature = getDistrictFeature(m.layerType, m.districtNumber);
        if (!feature) {
          var centroid = getDistrictCentroid(m.layerType, m.districtNumber);
          if (centroid) {
            entries.push({ m: m, pos: [centroid[0], centroid[1]], basePos: [centroid[0], centroid[1]], feature: null, layerType: m.layerType, key: m.layerType + '_' + m.districtNumber });
          }
          continue;
        }

        var pos;
        if (isDraw && hasDrawnPoly) {
          var anchors = getBorderSafeAnchorsServer(m.layerType, m.districtNumber);
          pos = nearestAnchorToDrawnPolygonServer(anchors, drawnPolygon.coordinates);
          if (!pos) pos = getDistrictPolylabelServer(m.layerType, m.districtNumber);
        } else if (hasOrigin) {
          pos = getBorderSafeBasePointServer(selectionOrigin.lat, selectionOrigin.lng, feature, m.layerType, m.districtNumber);
        } else {
          pos = getDistrictPolylabelServer(m.layerType, m.districtNumber);
        }
        if (!pos) pos = getDistrictCentroid(m.layerType, m.districtNumber);
        if (!pos) continue;

        entries.push({
          m: m,
          pos: [pos[0], pos[1]],
          basePos: [pos[0], pos[1]],
          feature: feature,
          layerType: m.layerType,
          key: m.layerType + '_' + m.districtNumber
        });
      }

      var leafletMarkersArr = [];
      for (var ei = 0; ei < entries.length; ei++) {
        var entry = entries[ei];
        var em = entry.m;

        var innerHtml;
        if (em.photoUrl) {
          innerHtml = '<img src="' + em.photoUrl + '" onerror="this.style.display=\\'none\\';this.nextSibling.style.display=\\'flex\\'" /><div class="headshot-initials" style="display:none">' + getInitials(em.name) + '</div>';
        } else {
          innerHtml = '<div class="headshot-initials">' + getInitials(em.name) + '</div>';
        }

        var html = '<div class="headshot-marker"><div class="headshot-bubble">' + innerHtml + '</div><div class="headshot-tail"></div></div>';
        var icon = L.divIcon({
          className: '',
          html: html,
          iconSize: [48, 62],
          iconAnchor: [24, 62]
        });
        var marker = L.marker(entry.pos, { icon: icon, interactive: true, zIndexOffset: 1000 });
        marker._officialId = em.officialId;
        marker.on('click', function(e) {
          L.DomEvent.stopPropagation(e);
          postMessage({ type: 'headshotMarkerClicked', officialId: this._officialId });
        });
        marker.addTo(map);
        headshotMarkers.push(marker);
        leafletMarkersArr.push(marker);
      }

      activeMarkerStateServer = {
        entries: entries,
        leafletMarkers: leafletMarkersArr
      };

      if (entries.length >= 2) {
        applyPixelLayoutServer();
      }
      
      if (overflow > 0) {
        var overflowPos;
        if (hasOrigin) {
          overflowPos = [selectionOrigin.lat, selectionOrigin.lng];
        } else {
          var sumLat = 0, sumLng = 0, cnt = 0;
          for (var j = 0; j < visible.length; j++) {
            var c = getDistrictCentroid(visible[j].layerType, visible[j].districtNumber);
            if (c) { sumLat += c[0]; sumLng += c[1]; cnt++; }
          }
          overflowPos = cnt > 0 ? [sumLat / cnt, sumLng / cnt] : null;
        }
        if (overflowPos) {
          var oHtml = '<div class="headshot-overflow"><div class="headshot-overflow-bubble">+' + overflow + '</div><div class="headshot-overflow-tail"></div></div>';
          var oIcon = L.divIcon({
            className: '',
            html: oHtml,
            iconSize: [48, 62],
            iconAnchor: [24, 62]
          });
          var oMarker = L.marker(overflowPos, { icon: oIcon, interactive: true, zIndexOffset: 1001 });
          oMarker.on('click', function(e) {
            L.DomEvent.stopPropagation(e);
            postMessage({ type: 'headshotOverflowClicked' });
          });
          oMarker.addTo(map);
          headshotMarkers.push(oMarker);
        }
      }

      console.log('[HEADSHOTS] Set', entries.length, 'markers, mode=' + (mode || 'default') + (isDraw && hasDrawnPoly ? ' (anchor-to-polygon)' : ''));
    };
    
    window.clearHeadshotMarkers = function() {
      for (var i = 0; i < headshotMarkers.length; i++) {
        map.removeLayer(headshotMarkers[i]);
      }
      headshotMarkers = [];
      activeMarkerStateServer = null;
    };
    
    window.receiveMessage = function(message) {
      try {
        var data = JSON.parse(message);
        console.log('[Leaflet] Received message:', data.type);
        
        if (data.type === 'toggleLayer') {
          window.toggleLayer(data.layer, data.visible);
        } else if (data.type === 'setGeoJSON') {
          var layerType = data.layerType;
          var typeKey = layerType === 'tx_senate' ? 'senate' : 
                        layerType === 'tx_house' ? 'house' : 'congress';
          geoJSONData[layerType] = data.geojson;
          loadStatus[layerType].loaded = true;
          loadStatus[layerType].features = data.geojson.features?.length || 0;
          if (layers[typeKey]) {
            map.removeLayer(layers[typeKey]);
          }
          layers[typeKey] = createLayer(typeKey, data.geojson, layerColors[layerType]);
          if (enabledLayers[typeKey]) {
            layers[typeKey].addTo(map);
            layers[typeKey].bringToFront();
          }
        } else if (data.type === 'SET_USER_LOCATION') {
          window.setUserLocation(data.lat, data.lng);
        } else if (data.type === 'CENTER_MAP') {
          window.centerMap(data.lat, data.lng, data.zoom);
        } else if (data.type === 'FOCUS_DISTRICT') {
          window.focusDistrict(data.layer, data.district);
        } else if (data.type === 'SET_ADDRESS_DOTS') {
          window.setAddressDots(data.dots || []);
        } else if (data.type === 'SET_ACTIVE_ADDRESS_DOT') {
          window.setActiveAddressDot(data.officialId);
        } else if (data.type === 'CLEAR_SELECTION') {
          // Clear any selection UI
        } else if (data.type === 'CLEAR_HIGHLIGHTS') {
          console.log('[Leaflet] Received CLEAR_HIGHLIGHTS message');
          window.clearHighlights();
        } else if (data.type === 'HIGHLIGHT_DISTRICTS') {
          console.log('[Leaflet] Received HIGHLIGHT_DISTRICTS, hits:', data.hits?.length);
          window.highlightDistricts(data.hits || []);
        } else if (data.type === 'SET_HEADSHOT_MARKERS') {
          console.log('[Leaflet] Received SET_HEADSHOT_MARKERS, count:', data.markers?.length);
          window.setHeadshotMarkers(data.markers || [], data.selectionOrigin || null, data.selectionMode || null, data.drawnPolygon || null);
        } else if (data.type === 'CLEAR_HEADSHOT_MARKERS') {
          console.log('[Leaflet] Received CLEAR_HEADSHOT_MARKERS');
          window.clearHeadshotMarkers();
        }
      } catch (e) {
        console.error('[Leaflet] Error processing message:', e);
      }
    };
    
    window.addEventListener('message', function(e) {
      if (e.data && typeof e.data === 'string') {
        window.receiveMessage(e.data);
      }
    });
    
    document.addEventListener('message', function(e) {
      window.receiveMessage(e.data);
    });
    
    // Auto-load GeoJSON on page load
    setTimeout(function() {
      console.log('[Leaflet] Auto-loading GeoJSON...');
      postMessage({ type: 'mapReady' });
      
      Promise.all([
        fetchAndSetGeoJSON('tx_senate'),
        fetchAndSetGeoJSON('tx_house'),
        fetchAndSetGeoJSON('us_congress')
      ]).then(function(results) {
        console.log('[Leaflet] All GeoJSON loaded:', results);
        postMessage({ type: 'allGeoJSONLoaded' });
      }).catch(function(err) {
        console.error('[Leaflet] GeoJSON load error:', err);
      });
    }, 100);
  </script>
</body>
</html>`;
}

function createVacantOfficial(source: DistrictSourceType, district: number): MergedOfficial {
  const chamber = source === "TX_HOUSE" ? "TX House" 
    : source === "TX_SENATE" ? "TX Senate" 
    : "US House";
  
  const vacantId = `VACANT-${source}-${district}`;
  
  return {
    id: vacantId,
    personId: null,
    source,
    sourceMemberId: vacantId,
    chamber,
    district: String(district),
    fullName: "Vacant District",
    roleTitle: null,
    party: null,
    photoUrl: null,
    capitolAddress: null,
    capitolPhone: null,
    capitolRoom: null,
    districtAddresses: null,
    districtPhones: null,
    website: null,
    email: null,
    active: true,
    lastRefreshedAt: new Date(),
    searchZips: null,
    searchCities: null,
    isVacant: true,
    private: null,
  };
}

function fillVacancies(
  officials: MergedOfficial[], 
  source: DistrictSourceType
): MergedOfficial[] {
  const range = DISTRICT_RANGES[source];
  const districtMap = new Map<string, MergedOfficial>();
  
  for (const official of officials) {
    districtMap.set(official.district, { ...official, isVacant: false });
  }
  
  const result: MergedOfficial[] = [];
  
  for (let d = range.min; d <= range.max; d++) {
    const districtStr = String(d);
    if (districtMap.has(districtStr)) {
      result.push(districtMap.get(districtStr)!);
    } else {
      result.push(createVacantOfficial(source, d));
    }
  }
  
  return result;
}
import { 
  maybeRunScheduledRefresh, 
  checkAndRefreshIfChanged, 
  getAllRefreshStates,
  getIsRefreshing,
  type SmartRefreshResult 
} from "./jobs/refreshOfficials";
import { startOfficialsRefreshScheduler, getSchedulerStatus } from "./jobs/scheduler";
import { 
  checkAndRefreshGeoJSONIfChanged, 
  getGeoJSONRefreshStates,
  getIsRefreshingGeoJSON,
} from "./jobs/refreshGeoJSON";
import {
  checkAndRefreshCommitteesIfChanged,
  getAllCommitteeRefreshStates,
  getIsRefreshingCommittees,
} from "./jobs/refreshCommittees";
import { lookupPlace, lookupPlaceCandidates, getCacheStats, type PlaceResult } from "./geonames";
import { committees, committeeMemberships } from "@shared/schema";

type DistrictType = "tx_house" | "tx_senate" | "us_congress";

function sourceFromDistrictType(dt: DistrictType): "TX_HOUSE" | "TX_SENATE" | "US_HOUSE" {
  switch (dt) {
    case "tx_house": return "TX_HOUSE";
    case "tx_senate": return "TX_SENATE";
    case "us_congress": return "US_HOUSE";
  }
}

function mergeOfficial(pub: OfficialPublic, priv: OfficialPrivate | null): MergedOfficial {
  const merged: MergedOfficial = { ...pub };
  if (priv) {
    merged.private = {
      personalPhone: priv.personalPhone,
      personalAddress: priv.personalAddress,
      spouseName: priv.spouseName,
      childrenNames: priv.childrenNames,
      birthday: priv.birthday,
      anniversary: priv.anniversary,
      notes: priv.notes,
      tags: priv.tags,
      updatedAt: priv.updatedAt,
      addressSource: priv.addressSource,
    };
  }
  return merged;
}

export async function registerRoutes(app: Express): Promise<Server> {
  maybeRunScheduledRefresh().catch(err => {
    console.error("[Startup] Failed to check scheduled refresh:", err);
  });

  setTimeout(async () => {
    const { bulkFillHometowns } = await import("./scripts/bulkFillHometowns");
    const maxRounds = 5;
    let totalFilled = 0;
    for (let round = 1; round <= maxRounds; round++) {
      try {
        console.log(`[Startup] Hometown backfill round ${round}/${maxRounds}...`);
        const result = await bulkFillHometowns();
        totalFilled += result.filled;
        console.log(`[Startup] Round ${round} done: filled=${result.filled}, skipped=${result.skipped}, notFound=${result.notFound}, errors=${result.errors}`);
        if (result.filled === 0) {
          console.log(`[Startup] No new hometowns found, stopping backfill. Total filled: ${totalFilled}`);
          break;
        }
        await new Promise(r => setTimeout(r, 10000));
      } catch (err) {
        console.error(`[Startup] Backfill round ${round} crashed:`, err instanceof Error ? err.message : err);
        if (round < maxRounds) {
          console.log(`[Startup] Waiting 30s before retry...`);
          await new Promise(r => setTimeout(r, 30000));
        }
      }
    }
  }, 90000);

  startOfficialsRefreshScheduler();

  registerPrayerRoutes(app);

  app.get("/api/geojson/tx_house", (_req, res) => {
    res.json(txHouseGeoJSON);
  });

  app.get("/api/geojson/tx_senate", (_req, res) => {
    res.json(txSenateGeoJSON);
  });

  app.get("/api/geojson/us_congress", (_req, res) => {
    res.json(usCongressGeoJSON);
  });

  app.get("/api/geojson/tx_house_full", (_req, res) => {
    res.json(txHouseGeoJSONFull);
  });

  app.get("/api/geojson/tx_senate_full", (_req, res) => {
    res.json(txSenateGeoJSONFull);
  });

  app.get("/api/geojson/us_congress_full", (_req, res) => {
    res.json(usCongressGeoJSONFull);
  });

  // Serve the map HTML page for iframe embedding
  app.get("/api/map.html", (_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.send(getMapHtml());
  });

  app.get("/api/officials", async (req, res) => {
    try {
      const { district_type, source, search, q, active } = req.query;
      
      const conditions = [];
      
      if (active !== "false") {
        conditions.push(eq(officialPublic.active, true));
      }
      
      let sourceFilter: SourceType | null = null;
      const isAllSources = source === "ALL";
      
      if (district_type && typeof district_type === "string") {
        const validTypes: DistrictType[] = ["tx_house", "tx_senate", "us_congress"];
        if (!validTypes.includes(district_type as DistrictType)) {
          return res.status(400).json({ error: "Invalid district_type" });
        }
        sourceFilter = sourceFromDistrictType(district_type as DistrictType);
        conditions.push(eq(officialPublic.source, sourceFilter));
      }
      
      if (source && typeof source === "string" && source !== "ALL") {
        const validSources = ["TX_HOUSE", "TX_SENATE", "US_HOUSE", "OTHER_TX"];
        if (!validSources.includes(source)) {
          return res.status(400).json({ error: "Invalid source" });
        }
        sourceFilter = source as SourceType;
        conditions.push(eq(officialPublic.source, sourceFilter));
      }
      
      const publicOfficials = await db.select()
        .from(officialPublic)
        .where(conditions.length > 0 ? and(...conditions) : undefined);
      
      const privateData = await db.select().from(officialPrivate);
      const privateMap = new Map(privateData.map(p => [p.officialPublicId, p]));
      
      let officials: MergedOfficial[] = publicOfficials.map(pub => 
        mergeOfficial(pub, privateMap.get(pub.id) || null)
      );
      
      // For source=ALL or no source filter, fill vacancies for all sources
      if (isAllSources || !sourceFilter) {
        // Combine officials from all sources with their vacancies
        const houseOfficials = fillVacancies(
          officials.filter(o => o.source === "TX_HOUSE"), 
          "TX_HOUSE"
        );
        const senateOfficials = fillVacancies(
          officials.filter(o => o.source === "TX_SENATE"), 
          "TX_SENATE"
        );
        const congressOfficials = fillVacancies(
          officials.filter(o => o.source === "US_HOUSE"), 
          "US_HOUSE"
        );
        officials = [...houseOfficials, ...senateOfficials, ...congressOfficials];
      } else if (sourceFilter && sourceFilter !== "OTHER_TX") {
        officials = fillVacancies(officials, sourceFilter);
      }
      
      // Multi-field search across name, district, addresses, party, email, website
      const searchTerm = search || q;
      if (searchTerm && typeof searchTerm === "string") {
        const term = searchTerm.toLowerCase();
        const beforeCount = officials.length;
        officials = officials.filter(o => {
          // Name match
          if (o.fullName.toLowerCase().includes(term)) return true;
          // District number match
          if (o.district.includes(term)) return true;
          // Vacancy match
          if (o.isVacant && "vacant".includes(term)) return true;
          // Party match
          if (o.party && o.party.toLowerCase().includes(term)) return true;
          // Capitol address match
          if (o.capitolAddress && o.capitolAddress.toLowerCase().includes(term)) return true;
          // District addresses match (JSON array)
          if (o.districtAddresses && Array.isArray(o.districtAddresses)) {
            for (const addr of o.districtAddresses) {
              if (typeof addr === "string" && addr.toLowerCase().includes(term)) return true;
            }
          }
          // Email match
          if (o.email && o.email.toLowerCase().includes(term)) return true;
          // Website match
          if (o.website && o.website.toLowerCase().includes(term)) return true;
          // Normalized search fields (faster for ZIP/city lookups)
          if (o.searchZips && o.searchZips.toLowerCase().includes(term)) return true;
          if (o.searchCities && o.searchCities.toLowerCase().includes(term)) return true;
          return false;
        });
        
        // Log search results for verification
        const afterCount = officials.length;
        const bySource: Record<string, number> = {};
        for (const o of officials) {
          bySource[o.source] = (bySource[o.source] || 0) + 1;
        }
        console.log(`[Search] q="${searchTerm}" | before=${beforeCount} | after=${afterCount} | bySource=${JSON.stringify(bySource)}`);
      }
      
      // Sorting: group by source (House, Senate, Congress), then by district asc, then by name
      const sourceOrder: Record<string, number> = {
        "TX_HOUSE": 1,
        "TX_SENATE": 2,
        "US_HOUSE": 3,
      };
      
      officials.sort((a, b) => {
        // First by source group (only matters for ALL source)
        if (isAllSources || !sourceFilter) {
          const orderA = sourceOrder[a.source] || 99;
          const orderB = sourceOrder[b.source] || 99;
          if (orderA !== orderB) return orderA - orderB;
        }
        // Then by district number
        const distA = parseInt(a.district, 10);
        const distB = parseInt(b.district, 10);
        if (!isNaN(distA) && !isNaN(distB)) {
          if (distA !== distB) return distA - distB;
        }
        // Then by last name
        const lastA = a.fullName.split(" ").pop() || "";
        const lastB = b.fullName.split(" ").pop() || "";
        return lastA.localeCompare(lastB);
      });
      
      const vacancyCount = officials.filter(o => o.isVacant).length;
      
      res.json({ officials, count: officials.length, vacancyCount });
    } catch (err) {
      console.error("[API] Error fetching officials:", err);
      res.status(500).json({ error: "Failed to fetch officials" });
    }
  });

  app.post("/api/officials/batch-backfill", async (req, res) => {
    try {
      const { officialIds } = req.body;
      
      if (!officialIds || !Array.isArray(officialIds)) {
        return res.status(400).json({ error: "officialIds array required" });
      }
      
      const results: Record<string, { hometown: string | null; addressSource: string | null }> = {};
      
      const privateRecords = await db.select({
        officialPublicId: officialPrivate.officialPublicId,
        personalAddress: officialPrivate.personalAddress,
        addressSource: officialPrivate.addressSource,
      }).from(officialPrivate);
      
      const privateMap = new Map(privateRecords.map(r => [r.officialPublicId, r]));
      
      for (const id of officialIds) {
        const priv = privateMap.get(id);
        results[id] = {
          hometown: priv?.personalAddress || null,
          addressSource: priv?.addressSource || null,
        };
      }
      
      res.json({ results });
    } catch (err) {
      console.error("[API] Batch backfill error:", err);
      res.status(500).json({ error: "Batch backfill failed" });
    }
  });

  app.get("/api/officials/backfill-audit", async (req, res) => {
    try {
      const allPublic = await db.select({
        id: officialPublic.id,
        fullName: officialPublic.fullName,
        source: officialPublic.source,
        district: officialPublic.district,
      }).from(officialPublic).where(eq(officialPublic.active, true));
      
      const allPrivate = await db.select().from(officialPrivate);
      const privMap = new Map(allPrivate.map(p => [p.officialPublicId, p]));
      
      const { isEffectivelyEmpty } = await import("./lib/backfillUtils");
      
      const audit = allPublic.map(pub => {
        const priv = privMap.get(pub.id);
        const address = priv?.personalAddress;
        const addrSource = priv?.addressSource || null;
        return {
          id: pub.id,
          name: pub.fullName,
          source: pub.source,
          district: pub.district,
          hasAddress: !isEffectivelyEmpty(address),
          address: address || null,
          addressSource: addrSource,
        };
      });
      
      const summary = {
        total: audit.length,
        withAddress: audit.filter(a => a.hasAddress).length,
        missingAddress: audit.filter(a => !a.hasAddress).length,
        bySource: {} as Record<string, { total: number; filled: number; missing: number }>,
        byAddressSource: {} as Record<string, number>,
      };
      
      for (const a of audit) {
        if (!summary.bySource[a.source]) {
          summary.bySource[a.source] = { total: 0, filled: 0, missing: 0 };
        }
        summary.bySource[a.source].total++;
        if (a.hasAddress) summary.bySource[a.source].filled++;
        else summary.bySource[a.source].missing++;
        
        const src = a.addressSource || "unknown";
        summary.byAddressSource[src] = (summary.byAddressSource[src] || 0) + 1;
      }
      
      res.json({ summary, officials: audit });
    } catch (err) {
      console.error("[API] Backfill audit error:", err);
      res.status(500).json({ error: "Audit failed" });
    }
  });

  // Get all officials with personal addresses (for map dots)
  // IMPORTANT: This route must come BEFORE /api/officials/:id to avoid matching "with-addresses" as an ID
  app.get("/api/officials/with-addresses", async (req, res) => {
    try {
      const results = await db
        .select({
          officialId: officialPublic.id,
          fullName: officialPublic.fullName,
          source: officialPublic.source,
          personalAddress: officialPrivate.personalAddress,
        })
        .from(officialPublic)
        .innerJoin(officialPrivate, eq(officialPublic.id, officialPrivate.officialPublicId))
        .where(
          and(
            eq(officialPublic.active, true),
            sql`${officialPrivate.personalAddress} IS NOT NULL AND ${officialPrivate.personalAddress} != ''`
          )
        );
      
      res.json({ 
        addresses: results.map(r => ({
          officialId: r.officialId,
          officialName: r.fullName,
          source: r.source,
          personalAddress: r.personalAddress,
        }))
      });
    } catch (err) {
      console.error("[API] Error fetching addresses:", err);
      res.status(500).json({ error: "Failed to fetch addresses" });
    }
  });

  app.get("/api/officials/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      const vacantMatch = id.match(/^VACANT-(TX_HOUSE|TX_SENATE|US_HOUSE)-(\d+)$/);
      if (vacantMatch) {
        const source = vacantMatch[1] as DistrictSourceType;
        const district = parseInt(vacantMatch[2], 10);
        const vacant = createVacantOfficial(source, district);
        return res.json({ official: vacant });
      }
      
      // Handle SOURCE:DISTRICT format (e.g., TX_HOUSE:1)
      const sourceDistrictMatch = id.match(/^(TX_HOUSE|TX_SENATE|US_HOUSE):(\d+)$/);
      if (sourceDistrictMatch) {
        const source = sourceDistrictMatch[1] as DistrictSourceType;
        const district = sourceDistrictMatch[2];
        
        const [pub] = await db.select()
          .from(officialPublic)
          .where(and(
            eq(officialPublic.source, source),
            eq(officialPublic.district, district),
            eq(officialPublic.active, true)
          ))
          .limit(1);
        
        if (!pub) {
          // Return vacancy if no official found
          const vacant = createVacantOfficial(source, parseInt(district, 10));
          return res.json({ official: vacant });
        }
        
        const [priv] = await db.select()
          .from(officialPrivate)
          .where(eq(officialPrivate.officialPublicId, pub.id))
          .limit(1);
        
        const official = mergeOfficial(pub, priv || null);
        official.isVacant = false;
        return res.json({ official });
      }
      
      const [pub] = await db.select()
        .from(officialPublic)
        .where(eq(officialPublic.id, id))
        .limit(1);
      
      if (!pub) {
        return res.status(404).json({ error: "Official not found" });
      }
      
      const [priv] = await db.select()
        .from(officialPrivate)
        .where(eq(officialPrivate.officialPublicId, id))
        .limit(1);
      
      const official = mergeOfficial(pub, priv || null);
      official.isVacant = false;
      res.json({ official });
    } catch (err) {
      console.error("[API] Error fetching official:", err);
      res.status(500).json({ error: "Failed to fetch official" });
    }
  });

  app.get("/api/officials/by-district", async (req, res) => {
    try {
      const { district_type, district_number } = req.query;
      
      if (!district_type || !district_number) {
        return res.status(400).json({ error: "district_type and district_number are required" });
      }
      
      const validTypes: DistrictType[] = ["tx_house", "tx_senate", "us_congress"];
      if (!validTypes.includes(district_type as DistrictType)) {
        return res.status(400).json({ error: "Invalid district_type" });
      }
      
      const distNum = String(district_number);
      const source = sourceFromDistrictType(district_type as DistrictType);
      
      const [pub] = await db.select()
        .from(officialPublic)
        .where(and(
          eq(officialPublic.source, source),
          eq(officialPublic.district, distNum),
          eq(officialPublic.active, true)
        ))
        .limit(1);
      
      if (!pub) {
        return res.status(404).json({ error: "Official not found" });
      }
      
      const [priv] = await db.select()
        .from(officialPrivate)
        .where(eq(officialPrivate.officialPublicId, pub.id))
        .limit(1);
      
      const official = mergeOfficial(pub, priv || null);
      res.json({ official });
    } catch (err) {
      console.error("[API] Error fetching official by district:", err);
      res.status(500).json({ error: "Failed to fetch official" });
    }
  });

  app.post("/api/officials/by-districts", async (req, res) => {
    try {
      const { districts } = req.body;
      
      if (!Array.isArray(districts) || districts.length === 0) {
        return res.status(400).json({ error: "districts array is required" });
      }
      
      const results: MergedOfficial[] = [];
      
      for (const dist of districts) {
        const { source, districtNumber } = dist;
        if (!source || districtNumber === undefined) continue;
        
        const [pub] = await db.select()
          .from(officialPublic)
          .where(and(
            eq(officialPublic.source, source),
            eq(officialPublic.district, String(districtNumber)),
            eq(officialPublic.active, true)
          ))
          .limit(1);
        
        if (pub) {
          const [priv] = await db.select()
            .from(officialPrivate)
            .where(eq(officialPrivate.officialPublicId, pub.id))
            .limit(1);
          
          results.push(mergeOfficial(pub, priv || null));
        } else {
          results.push(createVacantOfficial(source, districtNumber));
        }
      }
      
      res.json({ officials: results });
    } catch (err) {
      console.error("[API] Error fetching officials by districts:", err);
      res.status(500).json({ error: "Failed to fetch officials" });
    }
  });

  app.patch("/api/officials/:id/private", async (req, res) => {
    try {
      const { id } = req.params;
      
      const [pub] = await db.select()
        .from(officialPublic)
        .where(eq(officialPublic.id, id))
        .limit(1);
      
      if (!pub) {
        return res.status(404).json({ error: "Official not found" });
      }
      
      const parseResult = updateOfficialPrivateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: "Invalid request body", details: parseResult.error.issues });
      }
      
      const updateData = parseResult.data;
      
      const [existing] = await db.select()
        .from(officialPrivate)
        .where(eq(officialPrivate.officialPublicId, id))
        .limit(1);
      
      if (existing) {
        await db.update(officialPrivate)
          .set({
            ...updateData,
            addressSource: "user",
            updatedAt: new Date(),
          })
          .where(eq(officialPrivate.id, existing.id));
      } else {
        let finalUpdateData = { ...updateData };
        let autoFilled = false;
        
        const addressIsEmpty = !updateData.personalAddress || 
          updateData.personalAddress.trim().length === 0;
        
        if (addressIsEmpty && pub.fullName) {
          console.log(`[API] Auto-fill: Looking up hometown for new private notes record for "${pub.fullName}"`);
          try {
            const { lookupHometownFromTexasTribune } = await import("./lib/texasTribuneLookup");
            const result = await lookupHometownFromTexasTribune(pub.fullName);
            if (result.success && result.hometown) {
              console.log(`[API] Auto-fill: Setting personalAddress to "${result.hometown}" for ${pub.fullName}`);
              finalUpdateData.personalAddress = result.hometown;
              autoFilled = true;
            } else {
              console.log(`[API] Auto-fill: No hometown found for ${pub.fullName}`);
            }
          } catch (error) {
            console.error(`[API] Auto-fill: Error looking up hometown:`, error);
          }
        }
        
        await db.insert(officialPrivate).values({
          officialPublicId: id,
          ...finalUpdateData,
          addressSource: autoFilled ? "tribune" : "user",
          updatedAt: new Date(),
        });
      }
      
      const [updatedPriv] = await db.select()
        .from(officialPrivate)
        .where(eq(officialPrivate.officialPublicId, id))
        .limit(1);
      
      const official = mergeOfficial(pub, updatedPriv);
      res.json({ official });
    } catch (err) {
      console.error("[API] Error updating private data:", err);
      res.status(500).json({ error: "Failed to update private data" });
    }
  });

  app.post("/api/refresh", async (req, res) => {
    try {
      const { refreshAllOfficials } = await import("./jobs/refreshOfficials");
      await refreshAllOfficials();
      res.json({ success: true, message: "Refresh completed" });
    } catch (err) {
      console.error("[API] Error during manual refresh:", err);
      res.status(500).json({ error: "Refresh failed" });
    }
  });

  app.post("/admin/refresh/officials", async (req, res) => {
    try {
      const adminToken = process.env.ADMIN_REFRESH_TOKEN;
      const providedToken = req.headers["x-admin-token"];
      
      if (!adminToken) {
        return res.status(503).json({ 
          error: "Admin refresh not configured",
          message: "Set ADMIN_REFRESH_TOKEN environment variable" 
        });
      }
      
      if (!providedToken || providedToken !== adminToken) {
        return res.status(401).json({ error: "Invalid or missing admin token" });
      }
      
      if (getIsRefreshing()) {
        return res.status(409).json({ 
          error: "Refresh in progress",
          message: "A refresh is already running. Try again later." 
        });
      }
      
      const force = req.query.force === "true";
      
      console.log(`[Admin] Manual refresh triggered (force=${force})`);
      
      const result = await checkAndRefreshIfChanged(force);
      
      res.json({
        success: true,
        force,
        sourcesChecked: result.sourcesChecked,
        sourcesChanged: result.sourcesChanged,
        sourcesRefreshed: result.sourcesRefreshed,
        errors: result.errors,
        durationMs: result.durationMs,
      });
      
    } catch (err) {
      console.error("[Admin] Refresh error:", err);
      res.status(500).json({ error: "Refresh failed", details: String(err) });
    }
  });

  app.get("/admin/refresh/status", async (req, res) => {
    try {
      const adminToken = process.env.ADMIN_REFRESH_TOKEN;
      const providedToken = req.headers["x-admin-token"];
      
      if (!adminToken) {
        return res.status(503).json({ error: "Admin not configured" });
      }
      
      if (!providedToken || providedToken !== adminToken) {
        return res.status(401).json({ error: "Invalid or missing admin token" });
      }
      
      const refreshStates = await getAllRefreshStates();
      const geoJSONStates = await getGeoJSONRefreshStates();
      const committeeStates = await getAllCommitteeRefreshStates();
      const schedulerStatus = getSchedulerStatus();
      const isRefreshing = getIsRefreshing();
      const isRefreshingGeoJSON = getIsRefreshingGeoJSON();
      const isRefreshingCommittees = getIsRefreshingCommittees();
      
      res.json({
        isRefreshing,
        isRefreshingGeoJSON,
        isRefreshingCommittees,
        scheduler: schedulerStatus,
        officialsSources: refreshStates,
        geoJSONSources: geoJSONStates,
        committeeSources: committeeStates,
      });
      
    } catch (err) {
      console.error("[Admin] Status error:", err);
      res.status(500).json({ error: "Failed to get status" });
    }
  });

  app.post("/admin/refresh/geojson", async (req, res) => {
    try {
      const adminToken = process.env.ADMIN_REFRESH_TOKEN;
      const providedToken = req.headers["x-admin-token"];
      
      if (!adminToken) {
        return res.status(503).json({ 
          error: "Admin refresh not configured",
          message: "Set ADMIN_REFRESH_TOKEN environment variable" 
        });
      }
      
      if (!providedToken || providedToken !== adminToken) {
        return res.status(401).json({ error: "Invalid or missing admin token" });
      }
      
      if (getIsRefreshingGeoJSON()) {
        return res.status(409).json({ 
          error: "Refresh in progress",
          message: "A GeoJSON refresh is already running. Try again later." 
        });
      }
      
      const force = req.query.force === "true";
      
      console.log(`[Admin] Manual GeoJSON refresh triggered (force=${force})`);
      
      const result = await checkAndRefreshGeoJSONIfChanged(force);
      
      res.json({
        success: true,
        force,
        sourcesChecked: result.sourcesChecked,
        sourcesChanged: result.sourcesChanged,
        sourcesRefreshed: result.sourcesRefreshed,
        errors: result.errors,
        durationMs: result.durationMs,
      });
      
    } catch (err) {
      console.error("[Admin] GeoJSON refresh error:", err);
      res.status(500).json({ error: "Refresh failed", details: String(err) });
    }
  });

  app.get("/api/admin/geojson/source-debug", async (req, res) => {
    try {
      const adminToken = process.env.ADMIN_REFRESH_TOKEN;
      const providedToken = req.headers["x-admin-token"];
      
      if (!adminToken) {
        return res.status(503).json({ 
          error: "Admin refresh not configured",
          message: "Set ADMIN_REFRESH_TOKEN environment variable" 
        });
      }
      
      if (!providedToken || providedToken !== adminToken) {
        return res.status(401).json({ error: "Invalid or missing admin token" });
      }
      
      const sources = [
        {
          name: "TX_HOUSE",
          url: "https://services.arcgis.com/KTcxiTD9dsQw4r7Z/ArcGIS/rest/services/Texas_State_House_Districts/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultRecordCount=1"
        },
        {
          name: "TX_SENATE",
          url: "https://services.arcgis.com/KTcxiTD9dsQw4r7Z/ArcGIS/rest/services/Texas_State_Senate_Districts/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultRecordCount=1"
        },
        {
          name: "US_CONGRESS",
          url: "https://services.arcgis.com/KTcxiTD9dsQw4r7Z/ArcGIS/rest/services/Texas_US_House_Districts/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultRecordCount=1"
        }
      ];
      
      const results = await Promise.all(sources.map(async (source) => {
        try {
          const response = await fetch(source.url);
          const data = await response.json() as { features?: Array<{ properties?: Record<string, unknown> }> };
          const sampleProps = data.features?.[0]?.properties || {};
          
          const countUrl = source.url.replace("resultRecordCount=1", "returnCountOnly=true");
          const countResponse = await fetch(countUrl);
          const countData = await countResponse.json() as { count?: number };
          
          return {
            name: source.name,
            featureCount: countData.count,
            samplePropertyKeys: Object.keys(sampleProps),
            sampleDistrictValue: sampleProps.DIST_NBR,
            sampleRepName: sampleProps.REP_NM,
            status: "ok"
          };
        } catch (err) {
          return {
            name: source.name,
            status: "error",
            error: String(err)
          };
        }
      }));
      
      res.json({ sources: results });
      
    } catch (err) {
      console.error("[Admin] GeoJSON source debug error:", err);
      res.status(500).json({ error: "Debug failed", details: String(err) });
    }
  });

  app.get("/api/admin/officials-counts", async (_req, res) => {
    try {
      const counts = await db.select({
        source: officialPublic.source,
        count: sql<number>`count(*)::int`,
      })
        .from(officialPublic)
        .where(eq(officialPublic.active, true))
        .groupBy(officialPublic.source);
      
      const countsBySource: Record<string, number> = {
        TX_HOUSE: 0,
        TX_SENATE: 0,
        US_HOUSE: 0,
      };
      
      for (const { source, count } of counts) {
        countsBySource[source] = count;
      }
      
      const lastRefreshJobs = await db.select()
        .from(refreshJobLog)
        .orderBy(desc(refreshJobLog.startedAt))
        .limit(5);
      
      const lastSuccessfulRefresh = lastRefreshJobs.find(j => j.status === 'success');
      const lastFailedRefresh = lastRefreshJobs.find(j => j.status === 'failed' || j.status === 'aborted');
      
      const result = {
        counts: countsBySource,
        total: countsBySource.TX_HOUSE + countsBySource.TX_SENATE + countsBySource.US_HOUSE,
        lastRefresh: lastSuccessfulRefresh ? {
          source: lastSuccessfulRefresh.source,
          completedAt: lastSuccessfulRefresh.completedAt,
          parsedCount: lastSuccessfulRefresh.parsedCount,
          upsertedCount: lastSuccessfulRefresh.upsertedCount,
          durationMs: lastSuccessfulRefresh.durationMs,
        } : null,
        lastError: lastFailedRefresh ? {
          source: lastFailedRefresh.source,
          startedAt: lastFailedRefresh.startedAt,
          status: lastFailedRefresh.status,
          errorMessage: lastFailedRefresh.errorMessage,
        } : null,
        recentJobs: lastRefreshJobs.map(j => ({
          source: j.source,
          status: j.status,
          startedAt: j.startedAt,
          completedAt: j.completedAt,
          errorMessage: j.errorMessage,
        })),
      };
      
      console.log("[API] Admin officials counts:", result.counts);
      
      res.set("Cache-Control", "no-store, no-cache, must-revalidate");
      res.json(result);
    } catch (err) {
      console.error("[API] Error fetching admin counts:", err);
      res.status(500).json({ error: "Failed to fetch counts" });
    }
  });

  app.get("/api/stats", async (_req, res) => {
    try {
      const counts = await db.select({
        source: officialPublic.source,
        count: sql<number>`count(*)::int`,
      })
        .from(officialPublic)
        .where(eq(officialPublic.active, true))
        .groupBy(officialPublic.source);
      
      const stats: Record<string, number> = {
        tx_house: 0,
        tx_senate: 0,
        us_congress: 0,
        total: 0,
      };
      
      for (const { source, count } of counts) {
        if (source === "TX_HOUSE") stats.tx_house = count;
        if (source === "TX_SENATE") stats.tx_senate = count;
        if (source === "US_HOUSE") stats.us_congress = count;
        stats.total += count;
      }
      
      if (stats.total === 0) {
        return res.json({
          tx_house: 150,
          tx_senate: 31,
          us_congress: 38,
          total: 219,
          source: "fallback",
        });
      }
      
      res.json(stats);
    } catch (err) {
      console.error("[API] Error fetching stats:", err);
      res.json({
        tx_house: 150,
        tx_senate: 31,
        us_congress: 38,
        total: 219,
        source: "fallback",
      });
    }
  });

  // Cache parsed GeoJSON feature collections for spatial queries
  let cachedGeoJSON: {
    tx_house: FeatureCollection | null;
    tx_senate: FeatureCollection | null;
    us_congress: FeatureCollection | null;
  } = {
    tx_house: null,
    tx_senate: null,
    us_congress: null,
  };

  function getGeoJSONForOverlay(overlayType: string): FeatureCollection | null {
    if (overlayType === "house" || overlayType === "tx_house") {
      if (!cachedGeoJSON.tx_house) {
        cachedGeoJSON.tx_house = txHouseGeoJSON as unknown as FeatureCollection;
      }
      return cachedGeoJSON.tx_house;
    }
    if (overlayType === "senate" || overlayType === "tx_senate") {
      if (!cachedGeoJSON.tx_senate) {
        cachedGeoJSON.tx_senate = txSenateGeoJSON as unknown as FeatureCollection;
      }
      return cachedGeoJSON.tx_senate;
    }
    if (overlayType === "congress" || overlayType === "us_congress") {
      if (!cachedGeoJSON.us_congress) {
        cachedGeoJSON.us_congress = usCongressGeoJSON as unknown as FeatureCollection;
      }
      return cachedGeoJSON.us_congress;
    }
    return null;
  }

  function getSourceFromOverlay(overlay: string): SourceType {
    if (overlay === "house" || overlay === "tx_house") return "TX_HOUSE";
    if (overlay === "senate" || overlay === "tx_senate") return "TX_SENATE";
    return "US_HOUSE";
  }

  function getDistrictNumber(feature: Feature): number | null {
    const props = feature.properties || {};
    const districtNum = props.district || props.SLDUST || props.SLDLST || props.CD;
    return districtNum ? parseInt(String(districtNum)) : null;
  }

  app.get("/api/lookup/place", async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      
      if (q.length < 2) {
        return res.status(400).json({ error: "Query too short (min 2 characters)" });
      }

      const { result, fromCache, error } = await lookupPlace(q);

      if (error) {
        console.log(`[Lookup] Place error: ${error}`);
        return res.status(500).json({ error });
      }

      if (!result) {
        console.log(`[Lookup] No Texas place found for "${q}"`);
        return res.status(404).json({ message: "No Texas place found" });
      }

      console.log(`[Lookup] Place: "${q}" → ${result.name} (${result.lat}, ${result.lng}) [cache=${fromCache}]`);
      res.json({ ...result, fromCache });
    } catch (err) {
      console.error("[Lookup] Place error:", err);
      res.status(500).json({ error: "Place lookup failed" });
    }
  });

  app.get("/api/lookup/place/candidates", async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      const maxResults = Math.min(parseInt(String(req.query.max || "5"), 10) || 5, 10);
      
      if (q.length < 2) {
        return res.status(400).json({ error: "Query too short (min 2 characters)" });
      }

      const { results, fromCache, error } = await lookupPlaceCandidates(q, maxResults);

      if (error) {
        console.log(`[Lookup] Place candidates error: ${error}`);
        return res.status(500).json({ error });
      }

      console.log(`[Lookup] Place candidates: "${q}" → ${results.length} results [cache=${fromCache}]`);
      res.json({ results, fromCache });
    } catch (err) {
      console.error("[Lookup] Place candidates error:", err);
      res.status(500).json({ error: "Place lookup failed" });
    }
  });

  app.post("/api/lookup/districts-at-point", (req, res) => {
    try {
      const { lat, lng } = req.body;

      if (typeof lat !== "number" || typeof lng !== "number") {
        return res.status(400).json({ error: "lat and lng (numbers) are required" });
      }

      console.log(`[Lookup] Districts at point: (${lat}, ${lng})`);

      const point = turf.point([lng, lat]);
      const hits: { source: SourceType; districtNumber: number }[] = [];

      const overlayMappings: Array<{ overlay: "house" | "senate" | "congress"; source: SourceType }> = [
        { overlay: "house", source: "TX_HOUSE" },
        { overlay: "senate", source: "TX_SENATE" },
        { overlay: "congress", source: "US_HOUSE" },
      ];

      for (const { overlay, source } of overlayMappings) {
        const featureCollection = getGeoJSONForOverlay(overlay);
        if (!featureCollection || !featureCollection.features) continue;

        for (const feature of featureCollection.features) {
          try {
            if (turf.booleanPointInPolygon(point, feature as Feature<Polygon>)) {
              const districtNumber = getDistrictNumber(feature as Feature);
              if (districtNumber !== null) {
                hits.push({ source, districtNumber });
                break;
              }
            }
          } catch {
          }
        }
      }

      console.log(`[Lookup] Districts found: ${hits.map(h => `${h.source}:${h.districtNumber}`).join(", ") || "none"}`);
      res.json({ hits, lat, lng });
    } catch (err) {
      console.error("[Lookup] Districts-at-point error:", err);
      res.status(500).json({ error: "Failed to find districts at point" });
    }
  });

  app.get("/api/lookup/cache-stats", (req, res) => {
    res.json(getCacheStats());
  });

  // Committee API endpoints
  app.get("/api/committees", async (req, res) => {
    try {
      const chamber = req.query.chamber as string | undefined;
      
      let query = db.select().from(committees);
      
      if (chamber === "TX_HOUSE" || chamber === "TX_SENATE") {
        query = query.where(eq(committees.chamber, chamber)) as typeof query;
      }
      
      const allCommittees = await query.orderBy(committees.sortOrder, committees.name);
      
      const parentCommittees = allCommittees.filter(c => !c.parentCommitteeId);
      const subcommittees = allCommittees.filter(c => c.parentCommitteeId);
      
      const result = parentCommittees.map(parent => ({
        ...parent,
        subcommittees: subcommittees.filter(sub => sub.parentCommitteeId === parent.id),
      }));
      
      res.json(result);
    } catch (err) {
      console.error("[API] Error fetching committees:", err);
      res.status(500).json({ error: "Failed to fetch committees" });
    }
  });

  app.get("/api/committees/:committeeId", async (req, res) => {
    try {
      const { committeeId } = req.params;
      
      const committee = await db
        .select()
        .from(committees)
        .where(eq(committees.id, committeeId))
        .limit(1);
      
      if (committee.length === 0) {
        return res.status(404).json({ error: "Committee not found" });
      }
      
      const members = await db
        .select({
          id: committeeMemberships.id,
          memberName: committeeMemberships.memberName,
          roleTitle: committeeMemberships.roleTitle,
          sortOrder: committeeMemberships.sortOrder,
          officialPublicId: committeeMemberships.officialPublicId,
          officialName: officialPublic.fullName,
          officialDistrict: officialPublic.district,
          officialParty: officialPublic.party,
          officialPhotoUrl: officialPublic.photoUrl,
        })
        .from(committeeMemberships)
        .leftJoin(officialPublic, eq(committeeMemberships.officialPublicId, officialPublic.id))
        .where(eq(committeeMemberships.committeeId, committeeId))
        .orderBy(committeeMemberships.sortOrder);
      
      res.json({
        committee: committee[0],
        members,
      });
    } catch (err) {
      console.error("[API] Error fetching committee details:", err);
      res.status(500).json({ error: "Failed to fetch committee details" });
    }
  });

  app.get("/api/officials/:officialId/committees", async (req, res) => {
    try {
      const { officialId } = req.params;
      
      const memberships = await db
        .select({
          committeeId: committees.id,
          committeeName: committees.name,
          chamber: committees.chamber,
          roleTitle: committeeMemberships.roleTitle,
        })
        .from(committeeMemberships)
        .innerJoin(committees, eq(committeeMemberships.committeeId, committees.id))
        .where(eq(committeeMemberships.officialPublicId, officialId))
        .orderBy(committees.name);
      
      res.json(memberships);
    } catch (err) {
      console.error("[API] Error fetching official committees:", err);
      res.status(500).json({ error: "Failed to fetch official committees" });
    }
  });

  app.post("/admin/refresh/committees", async (req, res) => {
    try {
      const adminToken = process.env.ADMIN_REFRESH_TOKEN;
      const providedToken = req.headers["x-admin-token"];
      
      if (!adminToken) {
        return res.status(500).json({ error: "ADMIN_REFRESH_TOKEN not configured" });
      }
      
      if (providedToken !== adminToken) {
        return res.status(401).json({ error: "Invalid admin token" });
      }
      
      const force = req.query.force === "true";
      
      if (getIsRefreshingCommittees()) {
        return res.status(409).json({ error: "Committees refresh already in progress" });
      }
      
      console.log(`[Admin] Committees refresh triggered (force=${force})`);
      const result = await checkAndRefreshCommitteesIfChanged(force);
      
      res.json({
        success: true,
        results: result.results,
        durationMs: result.durationMs,
      });
    } catch (err) {
      console.error("[Admin] Committees refresh error:", err);
      res.status(500).json({ error: "Committees refresh failed" });
    }
  });

  // Other Texas Officials endpoints
  app.get("/api/other-tx-officials", async (req, res) => {
    try {
      const { active, grouped } = req.query;
      
      const conditions = [eq(officialPublic.source, "OTHER_TX")];
      
      if (active !== "false") {
        conditions.push(eq(officialPublic.active, true));
      }
      
      const officials = await db.select()
        .from(officialPublic)
        .where(and(...conditions));
      
      const privateData = await db.select().from(officialPrivate);
      const privateMap = new Map(privateData.map(p => [p.officialPublicId, p]));
      
      const merged: MergedOfficial[] = officials.map(pub => 
        mergeOfficial(pub, privateMap.get(pub.id) || null)
      );
      
      // Return grouped by category if requested
      if (grouped === "true") {
        const groupedOfficials = {
          executive: [] as MergedOfficial[],
          secretaryOfState: [] as MergedOfficial[],
          supremeCourt: [] as MergedOfficial[],
          criminalAppeals: [] as MergedOfficial[],
        };
        
        for (const official of merged) {
          const role = official.roleTitle || '';
          if (role.includes('Supreme Court')) {
            groupedOfficials.supremeCourt.push(official);
          } else if (role.includes('Criminal Appeals')) {
            groupedOfficials.criminalAppeals.push(official);
          } else if (role.includes('Secretary of State')) {
            groupedOfficials.secretaryOfState.push(official);
          } else {
            groupedOfficials.executive.push(official);
          }
        }
        
        // Sort Supreme Court and Criminal Appeals by place number
        const extractPlace = (role: string): number => {
          const match = role.match(/Place (\d+)/);
          return match ? parseInt(match[1], 10) : 0;
        };
        
        groupedOfficials.supremeCourt.sort((a, b) => 
          extractPlace(a.roleTitle || '') - extractPlace(b.roleTitle || '')
        );
        groupedOfficials.criminalAppeals.sort((a, b) => 
          extractPlace(a.roleTitle || '') - extractPlace(b.roleTitle || '')
        );
        
        res.json({
          grouped: groupedOfficials,
          counts: {
            executive: groupedOfficials.executive.length,
            secretaryOfState: groupedOfficials.secretaryOfState.length,
            supremeCourt: groupedOfficials.supremeCourt.length,
            criminalAppeals: groupedOfficials.criminalAppeals.length,
            total: merged.length,
          },
        });
        return;
      }
      
      res.json(merged);
    } catch (err) {
      console.error("[API] Error fetching other TX officials:", err);
      res.status(500).json({ error: "Failed to fetch other TX officials" });
    }
  });

  app.post("/admin/refresh/other-tx-officials", async (req, res) => {
    try {
      const adminToken = process.env.ADMIN_REFRESH_TOKEN;
      const providedToken = req.headers["x-admin-token"];
      
      if (!adminToken) {
        return res.status(500).json({ error: "ADMIN_REFRESH_TOKEN not configured" });
      }
      
      if (providedToken !== adminToken) {
        return res.status(401).json({ error: "Invalid admin token" });
      }
      
      const force = req.query.force === "true";
      
      console.log(`[Admin] Other TX Officials refresh triggered (force=${force})`);
      
      const { refreshOtherTexasOfficials } = await import("./jobs/refreshOtherTexasOfficials");
      const result = await refreshOtherTexasOfficials({ force });
      
      res.json({
        success: result.success,
        fingerprint: result.fingerprint,
        changed: result.changed,
        upsertedCount: result.upsertedCount,
        deactivatedCount: result.deactivatedCount,
        totalOfficials: result.totalOfficials,
        breakdown: result.breakdown,
        sources: result.sources,
        error: result.error,
      });
    } catch (err) {
      console.error("[Admin] Other TX Officials refresh error:", err);
      res.status(500).json({ error: "Other TX Officials refresh failed" });
    }
  });

  // Admin endpoint: Backfill headshots from Texas Tribune for TX House/Senate
  app.post("/admin/backfill/headshots", async (req, res) => {
    try {
      const adminToken = process.env.ADMIN_REFRESH_TOKEN;
      const providedToken = req.headers["x-admin-token"];
      
      if (!adminToken) {
        return res.status(503).json({ error: "Admin not configured" });
      }
      
      if (providedToken !== adminToken) {
        return res.status(401).json({ error: "Invalid admin token" });
      }
      
      const { lookupHeadshotFromTexasTribune } = await import("./lib/texasTribuneLookup");
      
      const officials = await db.select({
        id: officialPublic.id,
        fullName: officialPublic.fullName,
        source: officialPublic.source,
        photoUrl: officialPublic.photoUrl,
      })
      .from(officialPublic)
      .where(and(
        eq(officialPublic.active, true),
        inArray(officialPublic.source, ["TX_HOUSE", "TX_SENATE"]),
        or(
          isNull(officialPublic.photoUrl),
          eq(officialPublic.photoUrl, "")
        )
      ));
      
      console.log(`[Admin] Headshot backfill: ${officials.length} officials missing photos`);
      
      res.json({ 
        message: "Headshot backfill started",
        totalToProcess: officials.length,
      });
      
      let found = 0;
      let failed = 0;
      
      for (const official of officials) {
        try {
          const result = await lookupHeadshotFromTexasTribune(official.fullName);
          if (result.success && result.photoUrl) {
            await db.update(officialPublic)
              .set({ photoUrl: result.photoUrl })
              .where(eq(officialPublic.id, official.id));
            found++;
            console.log(`[Headshot] ${found}/${officials.length} Found: ${official.fullName}`);
          } else {
            failed++;
            console.log(`[Headshot] Not found: ${official.fullName}`);
          }
        } catch (err) {
          failed++;
          console.error(`[Headshot] Error for ${official.fullName}:`, err);
        }
        await new Promise(r => setTimeout(r, 1000));
      }
      
      console.log(`[Admin] Headshot backfill complete: ${found} found, ${failed} not found`);
    } catch (err) {
      console.error("[Admin] Headshot backfill error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Headshot backfill failed" });
      }
    }
  });

  // Admin endpoint: Create explicit person link (identity override)
  app.post("/admin/person/link", async (req, res) => {
    try {
      const adminToken = process.env.ADMIN_REFRESH_TOKEN;
      const providedToken = req.headers["x-admin-token"];
      
      if (!adminToken) {
        return res.status(503).json({ error: "Admin not configured" });
      }
      
      if (providedToken !== adminToken) {
        return res.status(401).json({ error: "Invalid admin token" });
      }
      
      const { officialPublicId, personId } = req.body;
      
      if (!officialPublicId || !personId) {
        return res.status(400).json({ error: "officialPublicId and personId are required" });
      }
      
      // Verify official exists
      const official = await db
        .select()
        .from(officialPublic)
        .where(eq(officialPublic.id, officialPublicId))
        .limit(1);
      
      if (official.length === 0) {
        return res.status(404).json({ error: "Official not found" });
      }
      
      // Verify person exists
      const { persons } = await import("@shared/schema");
      const person = await db
        .select()
        .from(persons)
        .where(eq(persons.id, personId))
        .limit(1);
      
      if (person.length === 0) {
        return res.status(404).json({ error: "Person not found" });
      }
      
      const { setExplicitPersonLink } = await import("./lib/identityResolver");
      const result = await setExplicitPersonLink(officialPublicId, personId);
      
      console.log(`[Admin] Created explicit person link: official ${officialPublicId} -> person ${personId}`);
      
      res.json({
        success: true,
        link: result,
        official: official[0],
        person: person[0],
      });
    } catch (err) {
      console.error("[Admin] Person link error:", err);
      res.status(500).json({ error: "Failed to create person link" });
    }
  });

  // Admin endpoint: Get comprehensive system status
  app.get("/admin/status", async (req, res) => {
    try {
      const adminToken = process.env.ADMIN_REFRESH_TOKEN;
      const providedToken = req.headers["x-admin-token"];
      
      if (!adminToken) {
        return res.status(503).json({ error: "Admin not configured" });
      }
      
      if (providedToken !== adminToken) {
        return res.status(401).json({ error: "Invalid admin token" });
      }
      
      // Get identity stats
      const { getIdentityStats, getAllExplicitPersonLinks } = await import("./lib/identityResolver");
      const identityStats = await getIdentityStats();
      const explicitLinks = await getAllExplicitPersonLinks();
      
      // Get refresh states for all data sources
      const officialsStates = await getAllRefreshStates();
      const geojsonStates = await getGeoJSONRefreshStates();
      const committeesStates = await getAllCommitteeRefreshStates();
      
      // Get scheduler status
      const schedulerStatus = getSchedulerStatus();
      
      // Format response
      const datasets = {
        officials: {
          TX_HOUSE: officialsStates.find(s => s.source === "TX_HOUSE") || null,
          TX_SENATE: officialsStates.find(s => s.source === "TX_SENATE") || null,
          US_HOUSE: officialsStates.find(s => s.source === "US_HOUSE") || null,
          isRefreshing: getIsRefreshing(),
        },
        other_tx_officials: {
          note: "Static data source - no refresh state tracking",
        },
        geojson: {
          states: geojsonStates,
          isRefreshing: getIsRefreshingGeoJSON(),
        },
        committees: {
          states: committeesStates,
          isRefreshing: getIsRefreshingCommittees(),
        },
      };
      
      res.json({
        timestamp: new Date().toISOString(),
        scheduler: schedulerStatus,
        datasets,
        identity: {
          ...identityStats,
          explicitLinksDetails: explicitLinks,
        },
      });
    } catch (err) {
      console.error("[Admin] Status error:", err);
      res.status(500).json({ error: "Failed to get system status" });
    }
  });

  app.post("/api/map/area-hits", (req, res) => {
    try {
      const { geometry, overlays } = req.body;

      if (!geometry || geometry.type !== "Polygon" || !Array.isArray(geometry.coordinates)) {
        return res.status(400).json({ error: "Invalid geometry: must be a Polygon" });
      }

      if (!overlays || typeof overlays !== "object") {
        return res.status(400).json({ error: "overlays object is required" });
      }

      console.log("[API] /api/map/area-hits - geometry points:", geometry.coordinates[0]?.length);
      console.log("[API] /api/map/area-hits - overlays:", JSON.stringify(overlays));

      const drawnPolygon = turf.polygon(geometry.coordinates);
      const hits: { source: SourceType; districtNumber: number }[] = [];
      const hitDebug: Record<string, number> = {};

      const overlayTypes = ["house", "senate", "congress"] as const;

      for (const overlayType of overlayTypes) {
        if (!overlays[overlayType]) continue;

        const featureCollection = getGeoJSONForOverlay(overlayType);
        if (!featureCollection || !featureCollection.features) {
          console.log(`[API] No GeoJSON for overlay: ${overlayType}`);
          continue;
        }

        let hitCount = 0;
        for (const feature of featureCollection.features) {
          try {
            if (booleanIntersects(drawnPolygon, feature as Feature)) {
              const districtNumber = getDistrictNumber(feature as Feature);
              if (districtNumber !== null) {
                const source = getSourceFromOverlay(overlayType);
                const alreadyExists = hits.some(
                  (h) => h.source === source && h.districtNumber === districtNumber
                );
                if (!alreadyExists) {
                  hits.push({ source, districtNumber });
                  hitCount++;
                }
              }
            }
          } catch (intersectErr) {
            // Skip invalid geometries
          }
        }
        hitDebug[overlayType] = hitCount;
      }

      console.log("[API] /api/map/area-hits - hits per overlay:", JSON.stringify(hitDebug));
      console.log("[API] /api/map/area-hits - total hits:", hits.length);

      res.json({ hits });
    } catch (err) {
      console.error("[API] Error in /api/map/area-hits:", err);
      res.status(500).json({ error: "Failed to compute area hits" });
    }
  });

  app.get("/api/photo-proxy", async (req, res) => {
    try {
      const url = req.query.url as string;
      if (!url) {
        return res.status(400).json({ error: "Missing url parameter" });
      }

      const allowedDomains = [
        "directory.texastribune.org",
        "www.congress.gov",
        "congress.gov",
        "bioguide.congress.gov",
      ];

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return res.status(400).json({ error: "Invalid URL" });
      }

      if (!allowedDomains.includes(parsedUrl.hostname)) {
        return res.status(403).json({ error: "Domain not allowed" });
      }

      const imageResponse = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "Referer": `https://${parsedUrl.hostname}/`,
        },
      });

      if (!imageResponse.ok) {
        return res.status(imageResponse.status).json({ error: "Failed to fetch image" });
      }

      const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
      const buffer = Buffer.from(await imageResponse.arrayBuffer());

      res.set({
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=604800, immutable",
        "Content-Length": String(buffer.length),
      });
      res.send(buffer);
    } catch (error) {
      console.error("[API] Photo proxy error:", error);
      res.status(500).json({ error: "Photo proxy failed" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
