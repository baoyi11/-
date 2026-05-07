'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Gauge } from 'lucide-react';
import type Plotly from 'plotly.js';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

interface FrictionCircleProps {
  lateralG?: number[];
  longG: number[];
  speed?: number[];
  latG?: number[];
}

const PLOT_CONFIG = {
  displayModeBar: false,
  responsive: true,
};

export default function FrictionCircle({ lateralG, longG, speed, latG }: FrictionCircleProps) {
  const lateralGData = latG ?? lateralG ?? [];
  const speedData = speed ?? [];
  const colorScale = speedData.length > 0
    ? speedData.map((s) => {
        const maxSpeed = Math.max(...speedData, 1);
        return s / maxSpeed;
      })
    : lateralGData.map(() => 0.5);

  const traces: Plotly.Data[] = [
    {
      x: lateralGData,
      y: longG,
      mode: 'markers',
      type: 'scatter',
      marker: {
        size: 4,
        color: colorScale,
        colorscale: 'Viridis',
        showscale: true,
        colorbar: {
          title: { text: '速度', font: { size: 10, color: '#5a5a68' } },
          tickfont: { size: 9, color: '#5a5a68' },
          thickness: 12,
          len: 0.6,
        },
        opacity: 0.7,
      },
      hovertemplate: '侧向G: %{x:.2f}g<br>纵向G: %{y:.2f}g<extra></extra>',
    } as Plotly.Data,
  ];

  const layout: Partial<Plotly.Layout> = {
    paper_bgcolor: '#0c0c12',
    plot_bgcolor: '#0c0c12',
    font: { family: 'Inter, sans-serif', color: '#5a5a68' },
    margin: { l: 50, r: 60, t: 10, b: 50 },
    xaxis: {
      title: { text: '侧向 G (g)', font: { size: 11, color: '#5a5a68' } },
      gridcolor: '#1a1a28',
      zerolinecolor: '#1a1a28',
      tickfont: { size: 10 },
      range: [-1.5, 1.5],
    },
    yaxis: {
      title: { text: '纵向 G (g)', font: { size: 11, color: '#5a5a68' } },
      gridcolor: '#1a1a28',
      zerolinecolor: '#1a1a28',
      tickfont: { size: 10 },
      range: [-1.5, 1.5],
      scaleanchor: 'x',
    },
    hoverlabel: {
      bgcolor: '#13131c',
      bordercolor: '#1a1a28',
      font: { color: '#e8e8ed', size: 11 },
    },
    shapes: [
      {
        type: 'circle',
        xref: 'x',
        yref: 'y',
        x0: -1.2,
        y0: -1.2,
        x1: 1.2,
        y1: 1.2,
        line: { color: '#1a1a28', width: 1, dash: 'dot' },
      },
      {
        type: 'circle',
        xref: 'x',
        yref: 'y',
        x0: -1.0,
        y0: -1.0,
        x1: 1.0,
        y1: 1.0,
        line: { color: '#00c89630', width: 1.5 },
      },
    ],
    height: 400,
  };

  return (
    <div className="rounded-lg border border-[#1a1a28] bg-[#0c0c12] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1a1a28] flex items-center gap-2">
        <Gauge className="w-4 h-4 text-[#5a5a68]" />
        <span className="text-xs font-medium text-[#5a5a68] tracking-wider uppercase">
          G值摩擦圆
        </span>
      </div>
      <div className="p-2">
        <Plot data={traces} layout={layout} config={PLOT_CONFIG} style={{ width: '100%' }} />
      </div>
    </div>
  );
}
