/* Route map (loaded lazily, Leaflet + OpenStreetMap tiles, no API key). The route arrives already
   trimmed by the privacy setting, so hidden points never reach the map: not the line, the markers,
   the bounds or the hover dot. Tile use follows the OSM tile policy: only visible tiles, no prefetch,
   no offline copies, attribution always shown. */
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import type { RoutePoint } from '@/core/types';
import { fraction, rampColor, valueRange, type RouteMetric } from './gradient';

export type KmMark = { km: number; lat: number; lng: number };

export default function RouteMap({ route, values, metric, kmMarks, active, onActive, dark, className }: {
  route: RoutePoint[];
  /** pace (s/km) or HR per route point */
  values: (number | null)[];
  metric: RouteMetric;
  kmMarks: KmMark[];
  /** seconds from the start to highlight (from the chart) */
  active: number | null;
  onActive: (tSec: number | null) => void;
  dark: boolean;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const lines = useRef<L.LayerGroup | null>(null);
  const dot = useRef<L.CircleMarker | null>(null);
  const routeRef = useRef(route);
  routeRef.current = route;
  const onActiveRef = useRef(onActive);
  onActiveRef.current = onActive;

  useEffect(() => {
    if (!el.current) return;
    const touch = L.Browser.mobile;
    const m = L.map(el.current, {
      zoomControl: true, attributionControl: true, scrollWheelZoom: false, dragging: !touch, tapHold: false,
      preferCanvas: true, zoomSnap: 0.25,
    });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    }).addTo(m);
    m.attributionControl.setPrefix(false);
    lines.current = L.layerGroup().addTo(m);
    // hover or tap on the line: nearest point within 28 px moves the dot (and the chart)
    const pick = (e: L.LeafletMouseEvent) => {
      const r = routeRef.current;
      if (!r.length) return;
      const p0 = m.latLngToContainerPoint(e.latlng);
      let best = -1, bd = 28 * 28;
      r.forEach((p, i) => {
        const q = m.latLngToContainerPoint([p.lat, p.lng]);
        const d = (q.x - p0.x) ** 2 + (q.y - p0.y) ** 2;
        if (d < bd) { bd = d; best = i; }
      });
      onActiveRef.current(best >= 0 ? r[best]!.tSec : null);
    };
    m.on('mousemove', pick);
    m.on('click', pick);
    m.on('mouseout', () => onActiveRef.current(null));
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []);

  // route line coloured by pace or HR, start/finish and km markers, fitted to the route
  useEffect(() => {
    const m = map.current, g = lines.current;
    if (!m || !g) return;
    g.clearLayers();
    dot.current = null;
    if (route.length < 2) return;
    const ll = route.map(p => L.latLng(p.lat, p.lng));
    L.polyline(ll, { color: dark ? '#0b0f13' : '#ffffff', weight: 8, opacity: 0.85, interactive: false }).addTo(g);
    const range = valueRange(values);
    for (let i = 1; i < route.length; i++) {
      const v = values[i] ?? values[i - 1];
      const color = range && v != null ? rampColor(metric, fraction(metric, v, range)) : '#c63f27';
      L.polyline([ll[i - 1]!, ll[i]!], { color, weight: 4.5, opacity: 1, lineCap: 'round', interactive: false }).addTo(g);
    }
    for (const k of kmMarks) {
      L.marker([k.lat, k.lng], {
        icon: L.divIcon({ className: '', html: `<div class="km-marker">${k.km}</div>`, iconSize: [20, 20], iconAnchor: [10, 10] }),
        keyboard: false, interactive: false,
      }).addTo(g);
    }
    L.circleMarker(ll[0]!, { radius: 7, color: '#ffffff', weight: 2.5, fillColor: '#1f9d55', fillOpacity: 1 }).bindTooltip('Start').addTo(g);
    L.circleMarker(ll[ll.length - 1]!, { radius: 7, color: '#ffffff', weight: 2.5, fillColor: '#141d26', fillOpacity: 1 }).bindTooltip('Finish').addTo(g);
    m.fitBounds(L.latLngBounds(ll), { padding: [24, 24] });
  }, [route, values, metric, kmMarks, dark]);

  // dot that follows the chart
  useEffect(() => {
    const m = map.current, g = lines.current;
    if (!m || !g) return;
    if (active == null || !route.length || active < route[0]!.tSec || active > route[route.length - 1]!.tSec) {
      if (dot.current) { g.removeLayer(dot.current); dot.current = null; }
      return;
    }
    let best = route[0]!;
    for (const p of route) if (Math.abs(p.tSec - active) < Math.abs(best.tSec - active)) best = p;
    if (!dot.current) dot.current = L.circleMarker([best.lat, best.lng], { radius: 7, color: '#ffffff', weight: 3, fillColor: '#2563eb', fillOpacity: 1, interactive: false }).addTo(g);
    else dot.current.setLatLng([best.lat, best.lng]);
  }, [active, route]);

  return <div ref={el} className={className} role="region" aria-label="Route map" />;
}
