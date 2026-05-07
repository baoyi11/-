'use client';

import React from 'react';
import { Gauge, AlertTriangle, Trophy, Flag, ThumbsUp, Zap } from 'lucide-react';

interface FeedbackPanelProps {
  feedback: {
    tier: string;
    title: string;
    summary: string;
    roast: string;
    full_text: string;
    overall_score: number;
    dimension_scores: {
      braking?: number;
      mid_speed?: number;
      throttle?: number;
      racing_line?: number;
    };
    worst_dimension: string | null;
    worst_dimension_score: number;
  };
}

const tierMeta: Record<string, { label: string; icon: React.ReactNode; color: string; glow: string }> = {
  Alien: {
    label: '外星人附体',
    icon: <Trophy className="w-5 h-5" />,
    color: '#00c896',
    glow: '0 0 30px rgba(0,200,150,0.15)',
  },
  Takumi: {
    label: '秋名山车神',
    icon: <Zap className="w-5 h-5" />,
    color: '#38bdf8',
    glow: '0 0 30px rgba(56,189,248,0.15)',
  },
  'Trackday Warrior': {
    label: '赛道日战士',
    icon: <ThumbsUp className="w-5 h-5" />,
    color: '#f59e0b',
    glow: '0 0 30px rgba(245,158,11,0.15)',
  },
  'Dynamic Hazard': {
    label: '动态路障',
    icon: <AlertTriangle className="w-5 h-5" />,
    color: '#f97316',
    glow: '0 0 30px rgba(249,115,22,0.15)',
  },
  'Mobile Chicane': {
    label: '移动减速带',
    icon: <Flag className="w-5 h-5" />,
    color: '#ef4444',
    glow: '0 0 30px rgba(239,68,68,0.15)',
  },
};

export default function FeedbackPanel({ feedback: fb }: FeedbackPanelProps) {
  const meta = tierMeta[fb.tier] || tierMeta['Trackday Warrior'];
  const overallScore = fb.overall_score;

  const dims = [
    { key: 'braking', label: '刹车', score: fb.dimension_scores.braking ?? 0 },
    { key: 'mid_speed', label: '弯速', score: fb.dimension_scores.mid_speed ?? 0 },
    { key: 'throttle', label: '油门', score: fb.dimension_scores.throttle ?? 0 },
    { key: 'racing_line', label: '走线', score: fb.dimension_scores.racing_line ?? 0 },
  ];

  return (
    <div
      className="rounded-lg border border-[#1a1a28] bg-[#0c0c12] overflow-hidden"
      style={{ boxShadow: meta.glow }}
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#1a1a28] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-[#5a5a68]" />
          <span className="text-xs font-medium text-[#5a5a68] tracking-wider uppercase">
            整体评价
          </span>
        </div>
        <div
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold"
          style={{
            backgroundColor: `${meta.color}12`,
            color: meta.color,
            border: `1px solid ${meta.color}20`,
          }}
        >
          {meta.icon}
          {meta.label}
        </div>
      </div>

      <div className="p-5">
        {/* Big Score */}
        <div className="flex items-baseline gap-3 mb-5">
          <span
            className="font-mono-data text-5xl font-bold tracking-tighter"
            style={{ color: meta.color }}
          >
            {overallScore.toFixed(1)}
          </span>
          <span className="text-xs text-[#5a5a68]">/ 100</span>
        </div>

        {/* Dimension bars */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          {dims.map((d) => {
            const pct = Math.max(0, Math.min(100, d.score));
            return (
              <div key={d.key} className="text-center">
                <div className="text-[10px] text-[#5a5a68] mb-1.5 tracking-wider uppercase">
                  {d.label}
                </div>
                <div className="font-mono-data text-lg font-semibold text-[#e8e8ed]">
                  {d.score.toFixed(0)}
                </div>
                <div className="mt-1.5 h-1 bg-[#13131c] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${pct}%`,
                      backgroundColor:
                        pct >= 90
                          ? '#00c896'
                          : pct >= 75
                            ? '#38bdf8'
                            : pct >= 60
                              ? '#f59e0b'
                              : '#ef4444',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Feedback text */}
        <div className="rounded-md bg-[#13131c] border border-[#1a1a28] p-3.5">
          <p className="text-sm text-[#9a9aa8] leading-relaxed">{fb.full_text}</p>
        </div>
      </div>
    </div>
  );
}
