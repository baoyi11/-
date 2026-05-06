'use client';

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plot = (dynamic(() => import('react-plotly.js'), { ssr: false }) as any);

interface TelemetryData {
  distance?: number[];
  speed?: number[];
  lat_g?: number[];
  long_g?: number[];
  steering?: number[];
  yaw_rate?: number[];
  slip_ratio?: number[];
}

interface TelemetryChartsProps {
  data: TelemetryData;
  cornerRanges?: Array<{ start: number; end: number; score: number }>;
}

export default function TelemetryCharts({ data, cornerRanges }: TelemetryChartsProps) {
  const x = useMemo(() => data.distance || Array.from({ length: data.speed?.length || 0 }, (_, i) => i), [data]);

  if (!x.length) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-500">
        暂无遥测数据
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const traces: Record<string, any[]> = {
    speed: [],
    gforce: [],
    steering: [],
    yaw: [],
  };

  // 速度
  if (data.speed?.length) {
    traces.speed.push({
      x,
      y: data.speed,
      mode: 'lines' as const,
      type: 'scatter' as const,
      name: '速度 (km/h)',
      line: { color: '#22d3ee', width: 1.5 },
      fill: 'tozeroy' as const,
      fillcolor: 'rgba(34, 211, 238, 0.1)',
    });
  }

  // G 值
  if (data.lat_g?.length) {
    traces.gforce.push({
      x,
      y: data.lat_g,
      mode: 'lines' as const,
      type: 'scatter' as const,
      name: '侧向 G',
      line: { color: '#f59e0b', width: 1.2 },
    });
  }
  if (data.long_g?.length) {
    traces.gforce.push({
      x,
      y: data.long_g,
      mode: 'lines' as const,
      type: 'scatter' as const,
      name: '纵向 G',
      line: { color: '#10b981', width: 1.2 },
    });
  }

  // 转向
  if (data.steering?.length) {
    traces.steering.push({
      x,
      y: data.steering,
      mode: 'lines' as const,
      type: 'scatter' as const,
      name: '方向盘转角 (deg)',
      line: { color: '#a78bfa', width: 1.2 },
    });
  }

  // 横摆
  if (data.yaw_rate?.length) {
    traces.yaw.push({
      x,
      y: data.yaw_rate,
      mode: 'lines' as const,
      type: 'scatter' as const,
      name: '横摆角速度 (rad/s)',
      line: { color: '#f472b6', width: 1.2 },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const makeLayout = (title: string, yTitle: string): any => ({
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: '#94a3b8', family: 'Inter, sans-serif', size: 11 },
    margin: { t: 24, r: 12, b: 28, l: 40 },
    xaxis: {
      title: { text: '距离 / 索引', font: { size: 11 } },
      gridcolor: 'rgba(148,163,184,0.08)',
      showgrid: true,
    },
    yaxis: {
      title: { text: yTitle, font: { size: 11 } },
      gridcolor: 'rgba(148,163,184,0.08)',
      showgrid: true,
      zerolinecolor: 'rgba(148,163,184,0.2)',
    },
    showlegend: true,
    legend: {
      x: 0.02,
      y: 1.0,
      bgcolor: 'rgba(15, 23, 42, 0.7)',
      font: { size: 10 },
    },
    title: {
      text: title,
      font: { size: 13, color: '#e2e8f0' },
      x: 0.5,
      xanchor: 'center' as const,
    },
    shapes: cornerRanges
      ? cornerRanges.flatMap((range, idx) => [
          {
            type: 'rect' as const,
            x0: x[Math.floor((range.start / x.length) * x.length)] || x[0],
            x1: x[Math.min(x.length - 1, Math.ceil((range.end / x.length) * x.length))] || x[x.length - 1],
            y0: 0,
            y1: 1,
            yref: 'paper' as const,
            fillcolor:
              range.score >= 85
                ? 'rgba(16, 185, 129, 0.06)'
                : range.score >= 70
                  ? 'rgba(34, 211, 238, 0.06)'
                  : range.score >= 55
                    ? 'rgba(245, 158, 11, 0.06)'
                    : 'rgba(239, 68, 68, 0.06)',
            line: { width: 0 },
            layer: 'below' as const,
          },
        ])
      : [],
  });

  const config = { displayModeBar: false, responsive: true };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 w-full h-full">
      {traces.speed.length > 0 && (
        <div className="bg-slate-900/40 rounded-xl border border-slate-700/50 p-2 min-h-[220px]">
          <Plot data={traces.speed} layout={makeLayout('速度曲线', 'Speed (km/h)')} config={config} style={{ width: '100%', height: '220px' }} useResizeHandler />
        </div>
      )}
      {traces.gforce.length > 0 && (
        <div className="bg-slate-900/40 rounded-xl border border-slate-700/50 p-2 min-h-[220px]">
          <Plot data={traces.gforce} layout={makeLayout('G 值', 'G-Force')} config={config} style={{ width: '100%', height: '220px' }} useResizeHandler />
        </div>
      )}
      {traces.steering.length > 0 && (
        <div className="bg-slate-900/40 rounded-xl border border-slate-700/50 p-2 min-h-[220px]">
          <Plot data={traces.steering} layout={makeLayout('方向盘输入', 'Steering (deg)')} config={config} style={{ width: '100%', height: '220px' }} useResizeHandler />
        </div>
      )}
      {traces.yaw.length > 0 && (
        <div className="bg-slate-900/40 rounded-xl border border-slate-700/50 p-2 min-h-[220px]">
          <Plot data={traces.yaw} layout={makeLayout('横摆动态', 'Yaw Rate')} config={config} style={{ width: '100%', height: '220px' }} useResizeHandler />
        </div>
      )}
    </div>
  );
}
