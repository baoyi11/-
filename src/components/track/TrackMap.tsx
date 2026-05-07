'use client';

import React, { useMemo, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet';
import { Map as MapIcon, Maximize2, Minimize2 } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

interface CornerInfo {
  corner_id: number;
  ai_class: string;
  ai_confidence: number;
  scores: {
    braking: number;
    mid_speed: number;
    throttle: number;
    racing_line: number;
    total: number;
  };
  flags: Record<string, boolean>;
  one_liner: string;
  meta: Record<string, unknown>;
  phase_stats: Record<string, unknown>;
  indices: { start: number; end: number; apex?: number };
}

interface TrackMapProps {
  trajectory: { x: number; y: number }[];
  corners: CornerInfo[];
  onCornerSelect?: (corner: CornerInfo) => void;
  selectedCornerId?: number | null;
}

function getScoreColor(score: number): string {
  if (score >= 90) return '#00c896';
  if (score >= 75) return '#38bdf8';
  if (score >= 60) return '#f59e0b';
  if (score >= 45) return '#f97316';
  return '#ef4444';
}

function getTierLabel(score: number): string {
  if (score >= 95) return '外星人';
  if (score >= 85) return '车神';
  if (score >= 70) return '战士';
  if (score >= 60) return '路障';
  return '减速带';
}

function MapController({ isFullscreen }: { isFullscreen: boolean }) {
  const map = useMap();
  React.useEffect(() => {
    setTimeout(() => map.invalidateSize(), 100);
  }, [isFullscreen, map]);
  return null;
}

export default function TrackMap({
  trajectory,
  corners,
  onCornerSelect,
  selectedCornerId,
}: TrackMapProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const positions = useMemo<[number, number][]>(() => {
    return trajectory.map((p) => [p.y, p.x]);
  }, [trajectory]);

  const center = useMemo<[number, number]>(() => {
    if (positions.length === 0) return [0, 0];
    const lats = positions.map((p) => p[0]);
    const lons = positions.map((p) => p[1]);
    return [(Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lons) + Math.max(...lons)) / 2];
  }, [positions]);

  const bounds = useMemo(() => {
    if (positions.length === 0) return undefined;
    const lats = positions.map((p) => p[0]);
    const lons = positions.map((p) => p[1]);
    return [
      [Math.min(...lats) - 0.001, Math.min(...lons) - 0.001],
      [Math.max(...lats) + 0.001, Math.max(...lons) + 0.001],
    ] as [[number, number], [number, number]];
  }, [positions]);

  const handleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  if (positions.length === 0) return null;

  const mapHeight = isFullscreen ? 'calc(100vh - 40px)' : '320px';

  const mapContent = (
    <>
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution="&copy; CARTO"
      />
      <Polyline positions={positions} pathOptions={{ color: '#1a1a28', weight: 3, opacity: 0.6 }} />
      {corners.map((corner, i) => {
        const idx = corner.indices.start;
        const pos = positions[idx];
        if (!pos) return null;
        const score = corner.scores.total;
        const color = getScoreColor(score);
        const isSelected = selectedCornerId === corner.corner_id;
        return (
          <CircleMarker
            key={i}
            center={pos}
            radius={isSelected ? 14 : 10}
            pathOptions={{
              color: isSelected ? '#e8e8ed' : color,
              fillColor: color,
              fillOpacity: 0.85,
              weight: isSelected ? 3 : 2,
            }}
            eventHandlers={{
              click: () => onCornerSelect?.(corner),
            }}
          >
            <Popup>
              <div className="text-xs space-y-1">
                <div className="font-semibold text-[#e8e8ed]">弯道 #{corner.corner_id}</div>
                <div className="text-[#5a5a68]">{corner.one_liner}</div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
      <MapController isFullscreen={isFullscreen} />
    </>
  );

  return (
    <div
      className={`rounded-md border border-[#1a1a28] bg-[#0c0c12] overflow-hidden ${
        isFullscreen ? 'fixed inset-0 z-50 p-4' : ''
      }`}
    >
      <div className="px-4 py-3 border-b border-[#1a1a28] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapIcon className="w-4 h-4 text-[#5a5a68]" />
          <span className="text-xs font-medium text-[#5a5a68] tracking-wider uppercase font-mono">
            赛道轨迹
          </span>
        </div>
        <button
          onClick={handleFullscreen}
          className="w-7 h-7 rounded flex items-center justify-center text-[#5a5a68] hover:text-[#e8e8ed] hover:bg-[#13131c] transition-colors"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>
      <div style={{ height: mapHeight }}>
        <MapContainer
          center={center}
          bounds={bounds}
          zoom={16}
          scrollWheelZoom
          style={{ height: '100%', width: '100%', background: '#0c0c12' }}
        >
          {mapContent}
        </MapContainer>
      </div>
      <div className="px-4 py-2 border-t border-[#1a1a28] flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#00c896]" />
          <span className="text-[10px] text-[#5a5a68]">优秀 (90+)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#38bdf8]" />
          <span className="text-[10px] text-[#5a5a68]">良好 (75-89)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#f59e0b]" />
          <span className="text-[10px] text-[#5a5a68]">一般 (60-74)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#ef4444]" />
          <span className="text-[10px] text-[#5a5a68]">需改进 (&lt;60)</span>
        </div>
      </div>
    </div>
  );
}
