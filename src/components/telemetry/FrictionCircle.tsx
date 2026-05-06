'use client';

import React from 'react';
import dynamic from 'next/dynamic';

// Plotly 组件需要动态导入以避免 SSR 问题
const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

interface FrictionCircleProps {
  latG: number[];
  longG: number[];
}

export default function FrictionCircle({ latG, longG }: FrictionCircleProps) {
  if (!latG?.length || !longG?.length) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-500">
        暂无 G 值数据
      </div>
    );
  }

  // 计算颜色：根据时间渐变
  const colors = latG.map((_, i) => i);

  const trace = {
    x: longG,
    y: latG,
    mode: 'markers' as const,
    type: 'scatter' as const,
    marker: {
      size: 4,
      color: colors,
      colorscale: 'Viridis' as const,
      opacity: 0.7,
      line: {
        width: 0,
      },
    },
    text: colors.map((_, i) => `样本 #${i}`),
    hovertemplate: '纵向 G: %{x:.3f}<br>侧向 G: %{y:.3f}<extra></extra>',
  };

  // 绘制理论摩擦圆
  const theta = Array.from({ length: 100 }, (_, i) => (i / 100) * 2 * Math.PI);
  const maxG = Math.max(
    1.5,
    Math.max(...latG.map(Math.abs), ...longG.map(Math.abs)) * 1.1
  );

  const circleTrace = {
    x: theta.map((t) => maxG * Math.cos(t)),
    y: theta.map((t) => maxG * Math.sin(t)),
    mode: 'lines' as const,
    type: 'scatter' as const,
    line: {
      color: 'rgba(148, 163, 184, 0.3)',
      width: 2,
      dash: 'dash' as const,
    },
    name: '理论极限',
    hoverinfo: 'skip' as const,
  };

  const layout = {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: {
      color: '#94a3b8',
      family: 'Inter, sans-serif',
    },
    margin: { t: 30, r: 20, b: 40, l: 40 },
    xaxis: {
      title: { text: '纵向 G (Longitudinal G)', font: { size: 12 } },
      zeroline: true,
      zerolinecolor: 'rgba(148,163,184,0.3)',
      gridcolor: 'rgba(148,163,184,0.1)',
      range: [-maxG, maxG],
    },
    yaxis: {
      title: { text: '侧向 G (Lateral G)', font: { size: 12 } },
      zeroline: true,
      zerolinecolor: 'rgba(148,163,184,0.3)',
      gridcolor: 'rgba(148,163,184,0.1)',
      range: [-maxG, maxG],
      scaleanchor: 'x' as const,
      scaleratio: 1,
    },
    showlegend: false,
    hovermode: 'closest' as const,
  };

  const config = {
    displayModeBar: false,
    responsive: true,
  };

  return (
    <div className="w-full h-full">
      <Plot
        data={[trace, circleTrace]}
        layout={layout}
        config={config}
        style={{ width: '100%', height: '100%' }}
        useResizeHandler
      />
    </div>
  );
}
