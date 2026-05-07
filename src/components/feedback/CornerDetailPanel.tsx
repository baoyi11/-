'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, AlertCircle, CheckCircle2, ChevronDown } from 'lucide-react';

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
  indices: {
    start: number;
    end: number;
  };
  meta: Record<string, unknown>;
  phase_stats: Record<string, unknown>;
}

interface CornerDetailPanelProps {
  corners: CornerResult[];
  selectedCorner: CornerResult | null;
  onSelectCorner: (corner: CornerResult) => void;
  onClose: () => void;
}

function scoreColor(score: number): string {
  if (score >= 85) return 'text-emerald-400';
  if (score >= 70) return 'text-cyan-400';
  if (score >= 55) return 'text-amber-400';
  return 'text-red-400';
}

function scoreBgColor(score: number): string {
  if (score >= 85) return 'bg-emerald-500/20 text-emerald-400';
  if (score >= 70) return 'bg-cyan-500/20 text-cyan-400';
  if (score >= 55) return 'bg-amber-500/20 text-amber-400';
  return 'bg-red-500/20 text-red-400';
}

function aiClassLabel(cls: string): string {
  if (cls === 'Perfect') return '完美';
  if (cls === 'Oversteer') return '转向过度';
  if (cls === 'Understeer') return '转向不足';
  return cls;
}

function FlagItem({ active, label }: { active: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs ${active ? 'text-red-400' : 'text-slate-500'}`}>
      {active ? <AlertCircle className="w-3.5 h-3.5 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
      <span>{label}</span>
    </div>
  );
}

export default function CornerDetailPanel({
  corners,
  selectedCorner,
  onSelectCorner,
  onClose,
}: CornerDetailPanelProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!selectedCorner || corners.length === 0) return null;

  const currentIdx = corners.findIndex((c) => c.corner_id === selectedCorner.corner_id);
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx < corners.length - 1;

  const s = selectedCorner.scores;

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      {/* 标题栏 + 弯道选择器 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-800/80">
        <div className="flex items-center gap-2">
          <button
            onClick={() => hasPrev && onSelectCorner(corners[currentIdx - 1])}
            disabled={!hasPrev}
            className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
              hasPrev ? 'hover:bg-slate-700 text-slate-400' : 'text-slate-600 cursor-not-allowed'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* 弯道选择下拉 */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-slate-700 transition-colors"
            >
              <h3 className="text-sm font-bold text-slate-100">
                弯道 #{selectedCorner.corner_id}
              </h3>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showDropdown && (
              <div className="absolute top-full left-0 mt-1 w-56 bg-slate-900 border border-slate-600 rounded-lg shadow-xl z-50 max-h-[280px] overflow-y-auto">
                {corners.map((corner) => {
                  const isActive = corner.corner_id === selectedCorner.corner_id;
                  const color =
                    corner.scores.total >= 85
                      ? '#10b981'
                      : corner.scores.total >= 70
                      ? '#22d3ee'
                      : corner.scores.total >= 55
                      ? '#f59e0b'
                      : '#ef4444';
                  return (
                    <button
                      key={corner.corner_id}
                      onClick={() => {
                        onSelectCorner(corner);
                        setShowDropdown(false);
                      }}
                      className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                        isActive ? 'bg-cyan-500/10' : 'hover:bg-slate-800'
                      }`}
                    >
                      <span
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                        style={{
                          backgroundColor: color + '20',
                          color: color,
                          border: `1.5px solid ${color}`,
                        }}
                      >
                        {Math.round(corner.scores.total)}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-200">
                          弯道 #{corner.corner_id}
                        </p>
                        <p className="text-[10px] text-slate-500 truncate">
                          {aiClassLabel(corner.ai_class)} · {corner.one_liner.slice(0, 20)}...
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <span
            className={`text-xs font-bold px-2 py-0.5 rounded ${scoreBgColor(selectedCorner.scores.total)}`}
          >
            {aiClassLabel(selectedCorner.ai_class)}
          </span>

          <button
            onClick={() => hasNext && onSelectCorner(corners[currentIdx + 1])}
            disabled={!hasNext}
            className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
              hasNext ? 'hover:bg-slate-700 text-slate-400' : 'text-slate-600 cursor-not-allowed'
            }`}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
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
          <p className="text-sm text-slate-300 italic">&ldquo;{selectedCorner.one_liner}&rdquo;</p>
        </div>

        {/* 失误标记 */}
        <div>
          <p className="text-xs text-slate-500 mb-2">AI 检测到的特征</p>
          <div className="grid grid-cols-2 gap-y-1.5">
            <FlagItem active={selectedCorner.flags.brake_too_early} label="刹车过早" />
            <FlagItem active={selectedCorner.flags.brake_too_late_or_lockup} label="刹车过晚/抱死" />
            <FlagItem active={selectedCorner.flags.throttle_choppy} label="油门断续" />
            <FlagItem active={selectedCorner.flags.throttle_too_early_full} label="过早全油门" />
            <FlagItem active={selectedCorner.flags.missed_apex} label="错过弯心" />
            <FlagItem active={selectedCorner.flags.over_slow} label="过度减速" />
          </div>
        </div>

        {/* 弯段统计 */}
        {Object.keys(selectedCorner.meta).length > 0 && (
          <div>
            <p className="text-xs text-slate-500 mb-2">弯道统计</p>
            <div className="flex flex-wrap gap-2">
              {selectedCorner.meta.duration_sec !== undefined && (
                <span className="text-xs bg-slate-700/50 text-slate-300 px-2 py-1 rounded">
                  时长: {String(selectedCorner.meta.duration_sec)}s
                </span>
              )}
              {selectedCorner.meta.avg_speed !== undefined && (
                <span className="text-xs bg-slate-700/50 text-slate-300 px-2 py-1 rounded">
                  均速: {String(selectedCorner.meta.avg_speed)}
                </span>
              )}
              {selectedCorner.meta.max_lat_g !== undefined && (
                <span className="text-xs bg-slate-700/50 text-slate-300 px-2 py-1 rounded">
                  最大侧向G: {String(selectedCorner.meta.max_lat_g)}g
                </span>
              )}
              {selectedCorner.meta.avg_steering !== undefined && (
                <span className="text-xs bg-slate-700/50 text-slate-300 px-2 py-1 rounded">
                  平均转向: {String(selectedCorner.meta.avg_steering)}°
                </span>
              )}
            </div>
          </div>
        )}

        {/* 子阶段 */}
        {Object.keys(selectedCorner.phase_stats).length > 0 && (
          <div>
            <p className="text-xs text-slate-500 mb-2">三阶段数据</p>
            <div className="grid grid-cols-3 gap-2">
              {(['entry', 'apex', 'exit'] as const).map((phase) => {
                const meta = selectedCorner.phase_stats[`${phase}_meta`] as
                  | { min_speed?: number; duration_sec?: number }
                  | undefined;
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
