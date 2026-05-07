'use client';

import React, { useMemo } from 'react';

interface RadarChartProps {
  scores: {
    braking?: number;
    mid_speed?: number;
    throttle?: number;
    racing_line?: number;
  };
}

export default function DimensionRadarChart({ scores }: RadarChartProps) {
  const svgRef = React.useRef<SVGSVGElement>(null);

  const dimensions = useMemo(
    () => [
      { label: '刹车技术', value: scores.braking ?? 50 },
      { label: '弯心速度', value: scores.mid_speed ?? 50 },
      { label: '油门控制', value: scores.throttle ?? 50 },
      { label: '走线精准', value: scores.racing_line ?? 50 },
    ],
    [scores]
  );

  const svgSize = 300;
  const cx = svgSize / 2;
  const cy = svgSize / 2;
  const maxRadius = 110;
  const levels = 5;
  const maxValue = 100;

  const angleSlice = (Math.PI * 2) / dimensions.length;

  // Compute polygon points
  const points = dimensions.map((d, i) => {
    const angle = i * angleSlice - Math.PI / 2;
    const r = (d.value / maxValue) * maxRadius;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  });

  const polygonPoints = points.map((p) => `${p.x},${p.y}`).join(' ');

  // Grid circles
  const gridCircles = Array.from({ length: levels }, (_, i) => {
    const r = ((i + 1) / levels) * maxRadius;
    return { r, value: ((i + 1) / levels) * maxValue };
  });

  // Axis end points
  const axisEnds = dimensions.map((d, i) => {
    const angle = i * angleSlice - Math.PI / 2;
    return {
      x: cx + maxRadius * Math.cos(angle),
      y: cy + maxRadius * Math.sin(angle),
      labelX: cx + (maxRadius + 20) * Math.cos(angle),
      labelY: cy + (maxRadius + 20) * Math.sin(angle),
      label: d.label,
      value: d.value,
    };
  });

  return (
    <div className="w-full flex justify-center items-center" style={{ height: 280 }}>
      <svg ref={svgRef} width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`}>
        {/* Grid circles */}
        {gridCircles.map((g, idx) => (
          <circle
            key={`grid-${idx}`}
            cx={cx}
            cy={cy}
            r={g.r}
            fill="none"
            stroke="rgba(148,163,184,0.15)"
            strokeWidth={1}
          />
        ))}

        {/* Grid radial lines */}
        {axisEnds.map((a, idx) => (
          <line
            key={`axis-${idx}`}
            x1={cx}
            y1={cy}
            x2={a.x}
            y2={a.y}
            stroke="rgba(148,163,184,0.15)"
            strokeWidth={1}
          />
        ))}

        {/* Value labels on vertical axis */}
        {gridCircles.map((g, idx) => (
          <text
            key={`tick-${idx}`}
            x={cx + 4}
            y={cy - g.r + 4}
            fontSize={9}
            fill="#64748b"
          >
            {Math.round(g.value)}
          </text>
        ))}

        {/* Data polygon */}
        <polygon
          points={polygonPoints}
          fill="rgba(34,211,238,0.25)"
          stroke="#22d3ee"
          strokeWidth={2}
        />

        {/* Data points */}
        {points.map((p, idx) => (
          <circle
            key={`point-${idx}`}
            cx={p.x}
            cy={p.y}
            r={4}
            fill="#22d3ee"
            stroke="#0f172a"
            strokeWidth={2}
          />
        ))}

        {/* Axis labels */}
        {axisEnds.map((a, idx) => (
          <g key={`label-${idx}`}>
            <text
              x={a.labelX}
              y={a.labelY}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={12}
              fill="#94a3b8"
              fontWeight={500}
            >
              {a.label}
            </text>
            <text
              x={a.labelX}
              y={a.labelY + 14}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={10}
              fill="#22d3ee"
              fontWeight={600}
            >
              {Math.round(a.value)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
