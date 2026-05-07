'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Activity } from 'lucide-react';
import type Plotly from 'plotly.js';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

interface TelemetryChartsProps {
  data: Record<string, number[]>;
  cornerRanges?: { start: number; end: number }[];
  colMapping?: Record<string, string>;
  cornerIndices?: number[];
}

const PLOT_CONFIG = {
  displayModeBar: false,
  responsive: true,
};

const PLOT_LAYOUT: Partial<Plotly.Layout> = {
  paper_bgcolor: '#0c0c12',
  plot_bgcolor: '#0c0c12',
  font: { family: 'Inter, sans-serif', color: '#5a5a68' },
  margin: { l: 50, r: 20, t: 10, b: 40 },
  xaxis: {
    gridcolor: '#1a1a28',
    zerolinecolor: '#1a1a28',
    tickfont: { size: 10 },
    title: { text: '时间 (帧)', font: { size: 11, color: '#5a5a68' } },
  },
  yaxis: {
    gridcolor: '#1a1a28',
    zerolinecolor: '#1a1a28',
    tickfont: { size: 10 },
  },
  hoverlabel: {
    bgcolor: '#13131c',
    bordercolor: '#1a1a28',
    font: { color: '#e8e8ed', size: 11 },
  },
  showlegend: true,
  legend: {
    x: 0,
    y: 1.15,
    orientation: 'h',
    font: { size: 10, color: '#5a5a68' },
    bgcolor: 'transparent',
  },
};

export default function TelemetryCharts({ data, colMapping, cornerRanges, cornerIndices = [] }: TelemetryChartsProps) {
  const speedKey = colMapping?.speed ?? 'speed';
  const throttleKey = colMapping?.throttle ?? 'throttle';
  const brakeKey = colMapping?.brake ?? 'brake';
  const steerKey = colMapping?.steering ?? 'steering';
  const latGKey = colMapping?.lat_g || colMapping?.lateral_g || 'lat_g';

  const x = Array.from({ length: data[speedKey]?.length || 0 }, (_, i) => i);

  const traces: Plotly.Data[] = [];

  if (speedKey && data[speedKey]) {
    traces.push({
      x,
      y: data[speedKey],
      name: '速度 (km/h)',
      type: 'scatter',
      mode: 'lines',
      line: { color: '#00c896', width: 1.5 },
      yaxis: 'y',
      hovertemplate: '速度: %{y:.1f} km/h<br>帧: %{x}<extra></extra>',
    } as Plotly.Data);
  }

  if (throttleKey && data[throttleKey]) {
    traces.push({
      x,
      y: data[throttleKey],
      name: '油门 (%)',
      type: 'scatter',
      mode: 'lines',
      line: { color: '#38bdf8', width: 1.5 },
      yaxis: 'y2',
      hovertemplate: '油门: %{y:.0f}%<br>帧: %{x}<extra></extra>',
    } as Plotly.Data);
  }

  if (brakeKey && data[brakeKey]) {
    traces.push({
      x,
      y: data[brakeKey],
      name: '刹车 (%)',
      type: 'scatter',
      mode: 'lines',
      line: { color: '#ef4444', width: 1.5 },
      yaxis: 'y2',
      hovertemplate: '刹车: %{y:.0f}%<br>帧: %{x}<extra></extra>',
    } as Plotly.Data);
  }

  if (steerKey && data[steerKey]) {
    traces.push({
      x,
      y: data[steerKey],
      name: '转向 (deg)',
      type: 'scatter',
      mode: 'lines',
      line: { color: '#f59e0b', width: 1.5 },
      yaxis: 'y3',
      hovertemplate: '转向: %{y:.1f}deg<br>帧: %{x}<extra></extra>',
    } as Plotly.Data);
  }

  if (latGKey && data[latGKey]) {
    traces.push({
      x,
      y: data[latGKey],
      name: '侧向G (g)',
      type: 'scatter',
      mode: 'lines',
      line: { color: '#a78bfa', width: 1.5 },
      yaxis: 'y4',
      hovertemplate: '侧向G: %{y:.2f}g<br>帧: %{x}<extra></extra>',
    } as Plotly.Data);
  }

  cornerIndices.forEach((idx) => {
    traces.push({
      x: [idx, idx],
      y: [0, 100],
      name: '',
      type: 'scatter',
      mode: 'lines',
      line: { color: '#ffffff15', width: 1, dash: 'dot' },
      showlegend: false,
      hoverinfo: 'skip',
    } as Plotly.Data);
  });

  const layout: Partial<Plotly.Layout> = {
    ...PLOT_LAYOUT,
    yaxis: {
      ...PLOT_LAYOUT.yaxis,
      title: { text: '速度', font: { size: 10 } },
      side: 'left',
      domain: [0, 1],
    },
    yaxis2: {
      ...PLOT_LAYOUT.yaxis,
      title: { text: '油门/刹车', font: { size: 10 } },
      overlaying: 'y',
      side: 'right',
      showgrid: false,
      range: [0, 100],
      domain: [0, 1],
    },
    yaxis3: {
      ...PLOT_LAYOUT.yaxis,
      title: { text: '转向', font: { size: 10 } },
      overlaying: 'y',
      side: 'right',
      showgrid: false,
      position: 0.95,
      domain: [0, 1],
    },
    yaxis4: {
      ...PLOT_LAYOUT.yaxis,
      title: { text: '侧向G', font: { size: 10 } },
      overlaying: 'y',
      side: 'left',
      showgrid: false,
      position: 0,
      domain: [0, 1],
    },
    grid: { rows: 1, columns: 1 },
    height: 360,
  };

  return (
    <div className="rounded-lg border border-[#1a1a28] bg-[#0c0c12] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1a1a28] flex items-center gap-2">
        <Activity className="w-4 h-4 text-[#5a5a68]" />
        <span className="text-xs font-medium text-[#5a5a68] tracking-wider uppercase">
          遥测时序
        </span>
      </div>
      <div className="p-2">
        <Plot data={traces} layout={layout} config={PLOT_CONFIG} style={{ width: '100%' }} />
      </div>
    </div>
  );
}
