'use client';

import React from 'react';
import { X, CornerRightDown, Gauge, AlertCircle, CheckCircle2 } from 'lucide-react';

interface CornerResult {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  meta?: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  phase_stats?: Record<string, any>;
}

interface CornerDetailPanelProps {
  corner: CornerResult | null;
  onClose: () => void;
}

function scoreColor(score: number): string {
  if (score >= 85) return 'text-emerald-400';
  if (score >= 70) return 'text-cyan-400';
  if (score >= 55) return 'text-amber-400';
  return 'text-red-400';
}

function FlagItem({ active, label }: { active: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs ${active ? 'text-red-400' : 'text-slate-600'}`}>
      {active ? <AlertCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
      <span>{label}</span>
    </div>
  );
}

export default function CornerDetailPanel({ corner, onClose }: CornerDetailPanelProps) {
  if (!corner) return null;

  const s = corner.scores;

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-800/80">
        <div className="flex items-center gap-2">
          <CornerRightDown className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-slate-100">
            弯道 #{corner.corner_id}
          </h3>
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded ${
              corner.ai_class === 'Perfect'
                ? 'bg-emerald-500/20 text-emerald-400'
                : corner.ai_class === 'Oversteer'
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-red-500/20 text-red-400'
            }`}
          >
            {corner.ai_class === 'Perfect' ? '完美' : corner.ai_class === 'Oversteer' ? '转向过度' : '转向不足'}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-200 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* 分数条 */}
        <div className="grid grid-cols-5 gap-2 text-center">
          {[
            { label: '刹车', val: s.braking },
            { label: '弯速', val: s.mid_speed },
            { label: '油门', val: s.throttle },
            { label: '走线', val: s.racing_line },
            { label: '总分', val: s.total },
          ].map((item) => (
            <div key={item.label} className="bg-slate-900/60 rounded-lg py-2">
              <p className={`text-lg font-bold ${scoreColor(item.val)}`}>{item.val}</p>
              <p className="text-[10px] text-slate-500">{item.label}</p>
            </div>
          ))}
        </div>

        {/* 一句话评价 */}
        <div className="bg-slate-900/40 rounded-lg px-3 py-2 border-l-2 border-cyan-500">
          <p className="text-sm text-slate-300 italic">&ldquo;{corner.one_liner}&rdquo;</p>
        </div>

        {/* 失误标记 */}
        <div>
          <p className="text-xs text-slate-500 mb-2">AI 检测到的特征</p>
          <div className="grid grid-cols-2 gap-y-1.5">
            <FlagItem active={corner.flags.brake_too_early} label="刹车过早" />
            <FlagItem active={corner.flags.brake_too_late_or_lockup} label="刹车过晚/抱死" />
            <FlagItem active={corner.flags.throttle_choppy} label="油门断续" />
            <FlagItem active={corner.flags.throttle_too_early_full} label="过早全油门" />
            <FlagItem active={corner.flags.missed_apex} label="错过弯心" />
            <FlagItem active={corner.flags.over_slow} label="过度减速" />
          </div>
        </div>

        {/* 弯段统计 */}
        {corner.meta && (
          <div>
            <p className="text-xs text-slate-500 mb-2">弯道统计</p>
            <div className="flex flex-wrap gap-2">
              {corner.meta.duration_sec !== undefined && (
                <span className="text-xs bg-slate-700/50 text-slate-300 px-2 py-1 rounded">
                  时长: {corner.meta.duration_sec}s
                </span>
              )}
              {corner.meta.avg_speed !== undefined && (
                <span className="text-xs bg-slate-700/50 text-slate-300 px-2 py-1 rounded">
                  均速: {corner.meta.avg_speed}
                </span>
              )}
              {corner.meta.max_lat_g !== undefined && (
                <span className="text-xs bg-slate-700/50 text-slate-300 px-2 py-1 rounded">
                  最大侧向G: {corner.meta.max_lat_g}g
                </span>
              )}
              {corner.meta.avg_steering !== undefined && (
                <span className="text-xs bg-slate-700/50 text-slate-300 px-2 py-1 rounded">
                  平均转向: {corner.meta.avg_steering}°
                </span>
              )}
            </div>
          </div>
        )}

        {/* 子阶段 */}
        {corner.phase_stats && (
          <div>
            <p className="text-xs text-slate-500 mb-2">三阶段数据</p>
            <div className="grid grid-cols-3 gap-2">
              {['entry', 'apex', 'exit'].map((phase) => {
                const meta = corner.phase_stats?.[`${phase}_meta`];
                if (!meta) return null;
                return (
                  <div key={phase} className="bg-slate-900/40 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-slate-500 uppercase">
                      {phase === 'entry' ? '入弯' : phase === 'apex' ? '弯心' : '出弯'}
                    </p>
                    {meta.min_speed !== undefined && (
                      <p className="text-xs text-slate-300">{meta.min_speed} km/h</p>
                    )}
                    {meta.duration_sec !== undefined && (
                      <p className="text-[10px] text-slate-500">{meta.duration_sec}s</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
