'use client';

import React from 'react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts';

interface RadarChartProps {
  scores: {
    braking?: number;
    mid_speed?: number;
    throttle?: number;
    racing_line?: number;
  };
}

export default function DimensionRadarChart({ scores }: RadarChartProps) {
  const data = [
    { subject: '刹车技术', key: 'braking', fullMark: 100 },
    { subject: '弯心速度', key: 'mid_speed', fullMark: 100 },
    { subject: '油门控制', key: 'throttle', fullMark: 100 },
    { subject: '走线精准', key: 'racing_line', fullMark: 100 },
  ];

  const chartData = data.map((d) => ({
    subject: d.subject,
    value: scores[d.key as keyof typeof scores] ?? 50,
    fullMark: d.fullMark,
  }));

  // 闭合雷达图
  if (chartData.length > 0) {
    chartData.push({ ...chartData[0] });
  }

  return (
    <div className="w-full h-full min-h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={chartData}>
          <PolarGrid stroke="rgba(148,163,184,0.2)" />
          <PolarAngleAxis
            dataKey="subject"
            tick={{ fill: '#94a3b8', fontSize: 12 }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fill: '#64748b', fontSize: 10 }}
            axisLine={false}
            tickCount={6}
          />
          <Radar
            name="得分"
            dataKey="value"
            stroke="#22d3ee"
            strokeWidth={2}
            fill="#22d3ee"
            fillOpacity={0.25}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
