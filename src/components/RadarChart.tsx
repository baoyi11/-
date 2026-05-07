'use client';

import React from 'react';
import { Radar } from 'lucide-react';

interface RadarChartProps {
  data?: {
    braking: number;
    midSpeed: number;
    throttle: number;
    racingLine: number;
  };
  scores?: {
    braking?: number;
    mid_speed?: number;
    throttle?: number;
    racing_line?: number;
  };
}

export default function RadarChart({ data, scores }: RadarChartProps) {
  const values = data
    ? [data.braking, data.midSpeed, data.throttle, data.racingLine]
    : [
        scores?.braking ?? 0,
        scores?.mid_speed ?? 0,
        scores?.throttle ?? 0,
        scores?.racing_line ?? 0,
      ];
  const labels = ['刹车', '弯速', '油门', '走线'];
  const maxVal = 100;

  const cx = 180;
  const cy = 160;
  const r = 100;
  const angleStep = (Math.PI * 2) / 4;

  const getPoint = (idx: number, val: number) => {
    const angle = -Math.PI / 2 + idx * angleStep;
    const ratio = val / maxVal;
    return {
      x: cx + r * ratio * Math.cos(angle),
      y: cy + r * ratio * Math.sin(angle),
    };
  };

  const getAxisPoint = (idx: number) => {
    const angle = -Math.PI / 2 + idx * angleStep;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  };

  const points = values.map((v, i) => getPoint(i, v));
  const pathD = `M ${points.map((p) => `${p.x},${p.y}`).join(' L ')} Z`;

  const axisEndPoints = labels.map((_, i) => getAxisPoint(i));

  const gridRings = [20, 40, 60, 80, 100];

  const getScoreColor = (score: number) => {
    if (score >= 90) return '#00c896';
    if (score >= 75) return '#38bdf8';
    if (score >= 60) return '#f59e0b';
    return '#ef4444';
  };

  const avgScore = values.reduce((a, b) => a + b, 0) / values.length;
  const mainColor = getScoreColor(avgScore);

  return (
    <div className="rounded-lg border border-[#1a1a28] bg-[#0c0c12] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1a1a28] flex items-center gap-2">
        <Radar className="w-4 h-4 text-[#5a5a68]" />
        <span className="text-xs font-medium text-[#5a5a68] tracking-wider uppercase">
          维度雷达
        </span>
      </div>
      <div className="p-5 flex justify-center">
        <svg viewBox="0 0 360 320" className="w-full max-w-[360px]">
          {/* Grid rings */}
          {gridRings.map((ring) => {
            const ringPoints = labels.map((_, i) => {
              const ratio = ring / maxVal;
              const angle = -Math.PI / 2 + i * angleStep;
              return `${cx + r * ratio * Math.cos(angle)},${cy + r * ratio * Math.sin(angle)}`;
            });
            return (
              <polygon
                key={ring}
                points={ringPoints.join(' ')}
                fill="none"
                stroke="#1a1a28"
                strokeWidth="1"
                strokeDasharray={ring < 100 ? '2 4' : 'none'}
              />
            );
          })}

          {/* Axis lines */}
          {axisEndPoints.map((p, i) => (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={p.x}
              y2={p.y}
              stroke="#1a1a28"
              strokeWidth="1"
            />
          ))}

          {/* Axis labels */}
          {axisEndPoints.map((p, i) => {
            const dx = p.x - cx;
            const dy = p.y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const labelX = cx + (dx / dist) * (r + 22);
            const labelY = cy + (dy / dist) * (r + 22);
            return (
              <text
                key={i}
                x={labelX}
                y={labelY}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-[11px]"
                fill="#5a5a68"
              >
                {labels[i]}
              </text>
            );
          })}

          {/* Value labels */}
          {points.map((p, i) => {
            const dx = p.x - cx;
            const dy = p.y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const labelX = cx + (dx / dist) * (dist + 14);
            const labelY = cy + (dy / dist) * (dist + 14);
            return (
              <text
                key={i}
                x={labelX}
                y={labelY}
                textAnchor="middle"
                dominantBaseline="middle"
                className="font-mono-data text-xs font-bold"
                fill={getScoreColor(values[i])}
              >
                {values[i].toFixed(0)}
              </text>
            );
          })}

          {/* Data polygon */}
          <polygon
            points={points.map((p) => `${p.x},${p.y}`).join(' ')}
            fill={mainColor}
            fillOpacity="0.12"
            stroke={mainColor}
            strokeWidth="2"
          />

          {/* Data points */}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="4"
              fill={mainColor}
              stroke="#0c0c12"
              strokeWidth="2"
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
