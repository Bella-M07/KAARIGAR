import React, { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { reverseGeocode } from '../lib/api';
import type { GeoCenter, Kaarigar } from '../types';

interface LiveMapProps {
  center: GeoCenter;
  radiusKm: number;
  kaarigars: Kaarigar[];
  selectedId: string | null;
  onSelectKaarigar: (kaarigar: Kaarigar) => void;
  onMoveUserCenter: (lat: number, lng: number, label: string) => void;
  onUseBrowserGps: () => void;
  locatingGps: boolean;
}

export function createGeoCircle(lat: number, lng: number, radiusKm: number, points = 64) {
  const coords: Array<[number, number]> = [];
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= points; i++) {
    const theta = (i / points) * Math.PI * 2;
    coords.push([lng + dLng * Math.cos(theta), lat + dLat * Math.sin(theta)]);
  }
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'Polygon' as const,
      coordinates: [coords],
    },
  };
}

function zoomForRadius(radiusKm: number): number {
  if (radiusKm <= 1) return 14.3;
  if (radiusKm <= 2) return 13.4;
  if (radiusKm <= 5) return 12.2;
  return 11.2;
}

const NAME_EXPR: any = ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name']];

/**
 * Custom Kaarigar Graphic Street Style powered by OpenFreeMap vector tiles (100% free, zero API key, zero watermarks).
 * Renders real Ahmedabad streets, Sabarmati River, parks, buildings & labels in Kaarigar's illustrated pastel palette!
 */
function buildKaarigarGraphicStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      openmaptiles: {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',
      },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': '#e9f5ee' },
      },
      {
        id: 'landcover-green',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landcover',
        filter: ['match', ['get', 'class'], ['grass', 'wood'], true, false],
        paint: { 'fill-color': '#d2ecd9', 'fill-opacity': 0.8 },
      },
      {
        id: 'park',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'park',
        paint: { 'fill-color': '#c9e8d2', 'fill-opacity': 0.9 },
      },
      {
        id: 'landuse-campus',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landuse',
        filter: ['match', ['get', 'class'], ['college', 'university', 'school', 'hospital'], true, false],
        paint: { 'fill-color': '#f5e4ec', 'fill-opacity': 0.55 },
      },
      {
        id: 'landuse-pitch-garden',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landuse',
        filter: ['match', ['get', 'class'], ['pitch', 'playground', 'stadium', 'cemetery'], true, false],
        paint: { 'fill-color': '#c9e8d2', 'fill-opacity': 0.75 },
      },
      {
        id: 'waterway',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'waterway',
        paint: {
          'line-color': '#B3E1E6',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 15, 5],
        },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'water',
        paint: {
          'fill-color': '#B3E1E6',
          'fill-outline-color': '#8ec7ce',
        },
      },
      {
        id: 'building',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 13.8,
        paint: {
          'fill-color': '#daeee1',
          'fill-outline-color': '#c3dfd0',
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13.8, 0, 15, 0.85],
        },
      },
      // Road Casings (subtle graphic outlines)
      {
        id: 'road-minor-casing',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 12.2,
        filter: ['match', ['get', 'class'], ['minor', 'service', 'street'], true, false],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#c8e1d3',
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 12.2, 1.8, 15, 6, 18, 15],
        },
      },
      {
        id: 'road-major-casing',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['match', ['get', 'class'], ['primary', 'secondary', 'tertiary'], true, false],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#b4d6c5',
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 10, 2.5, 13, 6.5, 16, 17, 18, 28],
        },
      },
      {
        id: 'road-highway-casing',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['match', ['get', 'class'], ['motorway', 'trunk'], true, false],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#e4be70',
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 9, 3, 13, 8, 16, 20, 18, 32],
        },
      },
      // Graphic White & Pastel Saffron Road Ribbons
      {
        id: 'road-minor',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 12.2,
        filter: ['match', ['get', 'class'], ['minor', 'service', 'street'], true, false],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 12.2, 1, 15, 4.2, 18, 12],
        },
      },
      {
        id: 'road-secondary-tertiary',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['match', ['get', 'class'], ['secondary', 'tertiary'], true, false],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 10, 1.4, 13, 4.2, 16, 13, 18, 22],
        },
      },
      {
        id: 'road-primary',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['==', ['get', 'class'], 'primary'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 9, 1.8, 13, 5.4, 16, 15, 18, 25],
        },
      },
      {
        id: 'road-highway',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['match', ['get', 'class'], ['motorway', 'trunk'], true, false],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#FFF0C2',
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 9, 2, 13, 6, 16, 16, 18, 27],
        },
      },
      {
        id: 'railway',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 11,
        filter: ['match', ['get', 'class'], ['rail', 'transit'], true, false],
        paint: {
          'line-color': '#8ebbb3',
          'line-width': 1.6,
          'line-dasharray': [2, 2],
        },
      },
      // Graphic Labels
      {
        id: 'waterway-label',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'waterway',
        minzoom: 11,
        layout: {
          'symbol-placement': 'line',
          'text-field': NAME_EXPR,
          'text-font': ['Noto Sans Italic'],
          'text-size': 12,
        },
        paint: {
          'text-color': '#18615d',
          'text-halo-color': '#e6f7f9',
          'text-halo-width': 1.5,
        },
      },
      {
        id: 'road-label',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'transportation_name',
        minzoom: 12.5,
        layout: {
          'symbol-placement': 'line',
          'text-field': NAME_EXPR,
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 12.5, 10.5, 16, 13],
        },
        paint: {
          'text-color': '#49655f',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.8,
        },
      },
      {
        id: 'poi-landmarks',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'poi',
        minzoom: 14.2,
        filter: ['<=', ['get', 'rank'], 14],
        layout: {
          'text-field': NAME_EXPR,
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-max-width': 8,
        },
        paint: {
          'text-color': '#6e3f5d',
          'text-halo-color': '#FFF6EE',
          'text-halo-width': 1.5,
        },
      },
      {
        id: 'place-neighbourhood',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        minzoom: 10.5,
        filter: [
          'match',
          ['get', 'class'],
          ['suburb', 'neighbourhood', 'quarter', 'village', 'hamlet'],
          true,
          false,
        ],
        layout: {
          'text-field': NAME_EXPR,
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 11, 11.5, 14, 14],
          'text-max-width': 8,
        },
        paint: {
          'text-color': '#3A1630',
          'text-halo-color': '#FFF6EE',
          'text-halo-width': 2.2,
        },
      },
      {
        id: 'place-city',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        maxzoom: 12.5,
        filter: ['match', ['get', 'class'], ['city', 'town'], true, false],
        layout: {
          'text-field': NAME_EXPR,
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 8, 13, 12, 17],
        },
        paint: {
          'text-color': '#1F6F6B',
          'text-halo-color': '#FFF6EE',
          'text-halo-width': 2.4,
        },
      },
    ],
  };
}

function resolveMapStyle(mode: 'graphic' | 'detailed'): string | maplibregl.StyleSpecification {
  const olaKey = import.meta.env.VITE_OLA_MAPS_API_KEY as string | undefined;
  if (mode === 'detailed' && olaKey) {
    return `https://api.olamaps.io/tiles/vector/v1/styles/default-light-standard-ml/style.json?api_key=${encodeURIComponent(olaKey)}`;
  }
  if (mode === 'detailed') {
    return 'https://tiles.openfreemap.org/styles/liberty';
  }
  return buildKaarigarGraphicStyle();
}

export const LiveMap: React.FC<LiveMapProps> = ({
  center,
  radiusKm,
  kaarigars,
  selectedId,
  onSelectKaarigar,
  onMoveUserCenter,
  onUseBrowserGps,
  locatingGps,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const zoneMarkersRef = useRef<maplibregl.Marker[]>([]);
  const [styleMode, setStyleMode] = useState<'graphic' | 'detailed'>('graphic');

  // Keep latest props in refs so style.load handler always renders current radius & privacy circles
  const latestStateRef = useRef({ center, radiusKm, kaarigars });
  latestStateRef.current = { center, radiusKm, kaarigars };

  const syncCustomOverlays = useCallback((map: maplibregl.Map) => {
    const { center: c, radiusKm: r, kaarigars: list } = latestStateRef.current;

    const radiusGeoJson: any = {
      type: 'FeatureCollection',
      features: [createGeoCircle(c.lat, c.lng, r)],
    };

    if (!map.getSource('search-radius')) {
      map.addSource('search-radius', { type: 'geojson', data: radiusGeoJson });
      map.addLayer({
        id: 'search-radius-fill',
        type: 'fill',
        source: 'search-radius',
        paint: { 'fill-color': '#1F6F6B', 'fill-opacity': 0.06 },
      });
      map.addLayer({
        id: 'search-radius-line',
        type: 'line',
        source: 'search-radius',
        paint: { 'line-color': '#1F6F6B', 'line-width': 2.5, 'line-dasharray': [3, 3] },
      });
    } else {
      (map.getSource('search-radius') as maplibregl.GeoJSONSource).setData(radiusGeoJson);
    }

    const zonesGeoJson: any = {
      type: 'FeatureCollection',
      features: list.map((k) => {
        const poly = createGeoCircle(k.maskedLat, k.maskedLng, 0.32, 36);
        return { ...poly, properties: { takingOrders: k.takingOrders, id: k.id } };
      }),
    };

    if (!map.getSource('privacy-zones')) {
      map.addSource('privacy-zones', { type: 'geojson', data: zonesGeoJson });
      map.addLayer({
        id: 'privacy-zones-fill',
        type: 'fill',
        source: 'privacy-zones',
        paint: {
          'fill-color': ['case', ['get', 'takingOrders'], '#D63F9B', '#7a5a70'],
          'fill-opacity': 0.16,
        },
      });
    } else {
      (map.getSource('privacy-zones') as maplibregl.GeoJSONSource).setData(zonesGeoJson);
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: resolveMapStyle('graphic'),
      center: [center.lng, center.lat],
      zoom: zoomForRadius(radiusKm),
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    const meEl = document.createElement('div');
    meEl.className = 'me-pin';
    meEl.title = 'You are here — drag anywhere to search that exact street';
    const userMarker = new maplibregl.Marker({ element: meEl, draggable: true })
      .setLngLat([center.lng, center.lat])
      .addTo(map);

    userMarker.on('dragend', async () => {
      const pos = userMarker.getLngLat();
      const lat = Number(pos.lat.toFixed(5));
      const lng = Number(pos.lng.toFixed(5));
      const rev = await reverseGeocode(lat, lng);
      onMoveUserCenter(lat, lng, rev.label);
    });

    map.on('style.load', () => {
      syncCustomOverlays(map);
    });

    mapRef.current = map;
    userMarkerRef.current = userMarker;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [syncCustomOverlays]);

  // Switch between Graphic pastel streets and Detailed street view
  const handleToggleStyle = () => {
    const next = styleMode === 'graphic' ? 'detailed' : 'graphic';
    setStyleMode(next);
    mapRef.current?.setStyle(resolveMapStyle(next));
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    userMarkerRef.current?.setLngLat([center.lng, center.lat]);
    map.flyTo({
      center: [center.lng, center.lat],
      zoom: zoomForRadius(radiusKm),
      duration: 750,
    });

    if (map.isStyleLoaded()) syncCustomOverlays(map);
  }, [center.lat, center.lng, radiusKm, syncCustomOverlays]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    zoneMarkersRef.current.forEach((m) => m.remove());
    zoneMarkersRef.current = [];

    kaarigars.forEach((k) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        'zone-pin' + (k.id === selectedId ? ' on' : '') + (k.takingOrders ? '' : ' closed');
      btn.textContent = k.emoji;
      btn.title = `${k.businessName} · Approximate ~350m zone (${k.areaName})`;
      btn.setAttribute(
        'aria-label',
        `${k.businessName}, approximate area in ${k.areaName}, ~${k.distanceKm} km`
      );
      btn.onclick = () => onSelectKaarigar(k);

      const marker = new maplibregl.Marker({ element: btn, anchor: 'center' })
        .setLngLat([k.maskedLng, k.maskedLat])
        .addTo(map);
      zoneMarkersRef.current.push(marker);
    });

    if (map.isStyleLoaded()) syncCustomOverlays(map);
  }, [kaarigars, selectedId, onSelectKaarigar, syncCustomOverlays]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const found = kaarigars.find((k) => k.id === selectedId);
    if (found) {
      map.panTo([found.maskedLng, found.maskedLat], { duration: 450 });
    }
  }, [selectedId, kaarigars]);

  return (
    <div className="map" role="group" aria-label="Live map of nearby kaarigars">
      <div ref={containerRef} className="map-canvas" />
      <div className="map-overlay-top">
        <span className="loc-pill" title="Drag the blue pin or search any society/street">
          📍 {center.label}
        </span>
        <b className="rad-badge">{radiusKm} km radius</b>
      </div>
      <div className="map-bottom-bar">
        <button
          type="button"
          className="map-locate-btn"
          onClick={onUseBrowserGps}
          disabled={locatingGps}
        >
          {locatingGps ? 'Locating…' : '🎯 Use my location'}
        </button>
        <button
          type="button"
          className="map-style-btn"
          onClick={handleToggleStyle}
          title="Switch between Graphic pastel streets and Detailed map"
        >
          {styleMode === 'graphic' ? '🗺️ Detailed view' : '🎨 Graphic view'}
        </button>
      </div>
    </div>
  );
};

// Interactive Pin-Picker Mini-Map for Kaarigar Onboarding Step 3
export const PinPickerMap: React.FC<{
  lat: number;
  lng: number;
  onChangePin: (lat: number, lng: number, addressLabel: string) => void;
}> = ({ lat, lng, onChangePin }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: buildKaarigarGraphicStyle(),
      center: [lng, lat],
      zoom: 14.5,
      attributionControl: false,
    });

    const pinEl = document.createElement('div');
    pinEl.className = 'me-pin';
    pinEl.style.background = '#D63F9B';
    pinEl.style.boxShadow = '0 0 0 12px #D63F9B33';
    const marker = new maplibregl.Marker({ element: pinEl, draggable: true })
      .setLngLat([lng, lat])
      .addTo(map);

    const resolvePos = async (nextLat: number, nextLng: number) => {
      const cleanLat = Number(nextLat.toFixed(5));
      const cleanLng = Number(nextLng.toFixed(5));
      const rev = await reverseGeocode(cleanLat, cleanLng);
      onChangePin(cleanLat, cleanLng, rev.label);
    };

    marker.on('dragend', () => {
      const p = marker.getLngLat();
      resolvePos(p.lat, p.lng);
    });

    map.on('click', (e) => {
      marker.setLngLat(e.lngLat);
      resolvePos(e.lngLat.lat, e.lngLat.lng);
    });

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    markerRef.current.setLngLat([lng, lat]);
    mapRef.current.flyTo({ center: [lng, lat], zoom: 14.5, duration: 500 });
  }, [lat, lng]);

  return (
    <div
      style={{
        position: 'relative',
        height: 185,
        borderRadius: 20,
        overflow: 'hidden',
        border: '3px solid var(--teal)',
      }}
    >
      <div ref={ref} className="map-canvas" />
      <span
        style={{
          position: 'absolute',
          bottom: 8,
          left: 8,
          zIndex: 3,
          background: '#FFF6EEee',
          padding: '2px 10px',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          color: '#3A1630',
        }}
      >
        Tap or drag pin to your exact home (masked to ~350m publicly)
      </span>
    </div>
  );
};
