"use client";

import { useEffect, useRef } from "react";
import { Map, Marker, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// Esquina Máximo Tajes y Beranger (el pin de Google Maps caía ~20 m al oeste, sobre Tajes).
const MAP_CENTER: [number, number] = [-56.0786133, -34.8774295];

// Next's bundler doesn't resolve MapLibre's own import.meta.url-based worker
// lookup, so the worker fails to load (blank map, marker only) unless we
// point it at a self-hosted copy of the same version's worker bundle.
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

// The OpenFreeMap Dark style's own defaults sit within a few shades of
// rgb(10,10,10) for background/buildings/roads alike, so against MOVE's UI
// nothing reads as distinct. These are the real layer ids of that style
// (fetched from https://tiles.openfreemap.org/styles/dark) — repainted to
// MOVE's monochrome palette once the style finishes loading.
const MAP_COLORS = {
  background: "#151515",
  roadMajor: "#505050",
  roadMinor: "#353535",
  building: "#242424",
  label: "#A3A3A3",
} as const;

const MAJOR_ROAD_LAYERS = [
  "highway_motorway_casing",
  "highway_motorway_inner",
  "highway_motorway_subtle",
  "highway_major_casing",
  "highway_major_inner",
  "highway_major_subtle",
];

const MINOR_ROAD_LAYERS = ["highway_minor", "highway_path"];

// Only text-color: halos (text-halo-color/width) stay as the style defines them.
const LABEL_LAYERS = [
  "water_name",
  "highway_name_other",
  "highway_name_motorway",
  "place_other",
  "place_suburb",
  "place_village",
  "place_town",
  "place_city",
  "place_city_large",
  "place_state",
  "place_country_other",
  "place_country_minor",
  "place_country_major",
];

function setLineColor(map: Map, layerIds: string[], color: string) {
  for (const id of layerIds) {
    if (map.getLayer(id)) map.setPaintProperty(id, "line-color", color);
  }
}

function setTextColor(map: Map, layerIds: string[], color: string) {
  for (const id of layerIds) {
    if (map.getLayer(id)) map.setPaintProperty(id, "text-color", color);
  }
}

function applyMoveColors(map: Map) {
  if (map.getLayer("background")) map.setPaintProperty("background", "background-color", MAP_COLORS.background);
  if (map.getLayer("building")) map.setPaintProperty("building", "fill-color", MAP_COLORS.building);
  setLineColor(map, MAJOR_ROAD_LAYERS, MAP_COLORS.roadMajor);
  setLineColor(map, MINOR_ROAD_LAYERS, MAP_COLORS.roadMinor);
  setTextColor(map, LABEL_LAYERS, MAP_COLORS.label);
}

export function LocationMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = new Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/dark",
      center: MAP_CENTER,
      zoom: 16,
      pitch: 0,
      attributionControl: false,
    });

    mapRef.current.on("load", () => {
      if (mapRef.current) applyMoveColors(mapRef.current);
    });

    const marker = new Marker({ color: "#ffffff" })
      .setLngLat(MAP_CENTER)
      .addTo(mapRef.current);

    marker.getElement().style.filter = "drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))";

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="h-full w-full rounded-xl" />;
}
