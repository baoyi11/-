'use client';

import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Gauge,
  Crosshair,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Timer,
  Wind,
  Navigation,
} from 'lucide-react';

export interface CornerResult {
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
  meta: Record<string, unknown>;
  phase_stats: Record<string, unknown>;
  indices: {
    start: number;
    end: number;
  };
}

// Legacy fallback interface for backward compatibility
interface LegacyCornerResult {
  number: number;
  corner_id?: number;
  entry_speed: number;
  apex_speed: number;
  exit_speed: number;
  score: number;
  braking_score?: number;
  mid_speed_score?: number;
  throttle_score?: number;
  racing_line_score?: number;
  ai_classification?: string;
  feedback?: string;
  flags?: Record<string, boolean>;
  entry_duration?: number;
  apex_duration?: number;
  exit_duration?: number;
  avg_lateral_g?: number;
  avg_steering_angle?: number;
  meta?: {
    corner_number: number;
    overall_score: number;
    tier: string;
    flags?: Record<string, boolean>;
  };
  phase_stats?: {
    entry_speed: number;
    apex_speed: number;
    exit_speed: number;
    entry_duration: number;
    apex_duration: number;
    exit_duration: number;
    avg_lateral_g: number;
    avg_steering_angle: number;
  };
}

type AnyCornerResult = CornerResult | LegacyCornerResult;

interface CornerDetailPanelProps {
  corner?: CornerResult;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  corners?: CornerResult[];
  selectedCorner?: CornerResult | null;
  onSelectCorner?: (corner: CornerResult | null) => void;
  onClose?: () => void;
}

const FLAG_LABELS: Record<string, string> = {
  brake_too_early: '刹车过早',
  brake_too_late_or_lockup: '刹车过晚/抱死',
  throttle_choppy: '油门断续',
  throttle_too_early_full: '过早全油门',
  missed_apex: '错过弯心',
  over_slow: '过度减速',
};

const FLAG_ORDER = [
  'brake_too_early',
  'brake_too_late_or_lockup',
  'throttle_choppy',
  'throttle_too_early_full',
  'missed_apex',
  'over_slow',
];

export default function CornerDetailPanel({
  corner: cornerProp,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  corners = [],
  selectedCorner,
  onSelectCorner,
  onClose,
}: CornerDetailPanelProps) {
  const rawCorner = (selectedCorner ?? cornerProp) as AnyCornerResult;
  const isLegacy = 'score' in rawCorner && !('scores' in rawCorner);
  const corner = rawCorner as CornerResult;
  const legacy = rawCorner as LegacyCornerResult;

  const meta = (corner?.meta || legacy?.meta || {}) as Record<string, unknown>;
  const ps = (corner?.phase_stats || legacy?.phase_stats || {}) as Record<string, unknown>;

  const scoreMap = isLegacy
    ? {
        braking: legacy.braking_score ?? 0,
        midSpeed: legacy.mid_speed_score ?? 0,
        throttle: legacy.throttle_score ?? 0,
        racingLine: legacy.racing_line_score ?? 0,
        total: legacy.score ?? 0,
      }
    : {
        braking: corner.scores?.braking ?? 0,
        midSpeed: corner.scores?.mid_speed ?? 0,
        throttle: corner.scores?.throttle ?? 0,
        racingLine: corner.scores?.racing_line ?? 0,
        total: corner.scores?.total ?? 0,
      };

  const aiClass = isLegacy
    ? (legacy.ai_classification || (meta as Record<string, string>).ai_classification || 'Unknown')
    : (corner.ai_class || (meta as Record<string, string>).ai_classification || 'Unknown');
  const aiLabel =
    aiClass === 'Understeer'
      ? { text: '转向不足', color: '#f59e0b' }
      : aiClass === 'Oversteer'
        ? { text: '转向过度', color: '#ef4444' }
        : aiClass === 'Perfect'
          ? { text: '完美', color: '#00c896' }
          : { text: '未知', color: '#5a5a68' };

  const tier =
    scoreMap.total >= 95
      ? { text: '外星人附体', color: '#00c896' }
      : scoreMap.total >= 85
        ? { text: '秋名山车神', color: '#38bdf8' }
        : scoreMap.total >= 70
          ? { text: '赛道日战士', color: '#f59e0b' }
          : scoreMap.total >= 60
            ? { text: '动态路障', color: '#f97316' }
            : { text: '移动减速带', color: '#ef4444' };

  const dims = [
    { label: '刹车', score: scoreMap.braking, key: 'braking' },
    { label: '弯速', score: scoreMap.midSpeed, key: 'midSpeed' },
    { label: '油门', score: scoreMap.throttle, key: 'throttle' },
    { label: '走线', score: scoreMap.racingLine, key: 'racingLine' },
    { label: '总分', score: scoreMap.total, key: 'total', highlight: true },
  ];

  const flags = isLegacy
    ? (legacy.flags || (meta as { flags?: Record<string, boolean> }).flags || {})
    : (corner.flags || {});
  const activeFlags = FLAG_ORDER.filter(
    (key) => flags[key]
  );

  const getPsNum = (key: string): number => {
    const val = (ps as Record<string, unknown>)[key];
    return typeof val === 'number' ? val : 0;
  };

  const statItems = [
    {
      icon: <Timer className="w-3.5 h-3.5" />,
      label: '时长',
      value: `${(getPsNum('entry_duration') + getPsNum('apex_duration') + getPsNum('exit_duration')).toFixed(2)}s`,
    },
    {
      icon: <Gauge className="w-3.5 h-3.5" />,
      label: '均速',
      value: `${((getPsNum('entry_speed') + getPsNum('apex_speed') + getPsNum('exit_speed')) / 3).toFixed(1)}`,
      unit: 'km/h',
    },
    {
      icon: <Crosshair className="w-3.5 h-3.5" />,
      label: '最大侧向G',
      value: `${(getPsNum('avg_lateral_g') * 1.5).toFixed(1)}g`,
    },
    {
      icon: <Navigation className="w-3.5 h-3.5" />,
      label: '平均转向',
      value: `${getPsNum('avg_steering_angle').toFixed(1)}deg`,
    },
  ];

  const phases = [
    { label: '入弯', speed: getPsNum('entry_speed'), duration: getPsNum('entry_duration') },
    { label: '弯心', speed: getPsNum('apex_speed'), duration: getPsNum('apex_duration') },
    { label: '出弯', speed: getPsNum('exit_speed'), duration: getPsNum('exit_duration') },
  ];

  return (
    <div className="rounded-lg border border-[#1a1a28] bg-[#0c0c12] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#1a1a28] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={onPrev}
            disabled={!hasPrev}
            className="w-7 h-7 rounded flex items-center justify-center text-[#5a5a68] hover:text-[#e8e8ed] hover:bg-[#13131c] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-[#e8e8ed]">
            弯道 #{corner.corner_id}
          </span>
          <button
            onClick={onNext}
            disabled={!hasNext}
            className="w-7 h-7 rounded flex items-center justify-center text-[#5a5a68] hover:text-[#e8e8ed] hover:bg-[#13131c] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {corners.length > 0 && onSelectCorner && (
            <select
              value={typeof selectedCorner === 'number' ? selectedCorner : selectedCorner ? corners.indexOf(selectedCorner as CornerResult) : 0}
              onChange={(e) => {
                const idx = Number(e.target.value);
                const c = corners[idx];
                if (c) onSelectCorner(c as CornerResult);
              }}
              className="text-xs bg-[#13131c] border border-[#1a1a28] rounded px-2 py-1 text-[#e8e8ed] focus:outline-none focus:border-[#00c896]/50"
            >
              {corners.map((c, idx) => {
                const raw = c as unknown as AnyCornerResult;
                const isL = 'score' in raw && !('scores' in raw);
                const s = isL ? (raw as LegacyCornerResult).score ?? 0 : (raw as CornerResult).scores?.total ?? 0;
                const aic = isL
                  ? (((raw as LegacyCornerResult).meta as Record<string, unknown>)?.ai_classification as string || 'Unknown')
                  : ((raw as CornerResult).ai_class || 'Unknown');
                const id = isL ? ((raw as LegacyCornerResult).number ?? (raw as LegacyCornerResult).corner_id) : (raw as CornerResult).corner_id;
                return (
                  <option key={idx} value={idx}>
                    弯道 #{id} — {s.toFixed(0)}分 ({aic})
                  </option>
                );
              })}
            </select>
          )}
          <span
            className="text-xs font-medium px-2 py-0.5 rounded"
            style={{
              backgroundColor: `${aiLabel.color}12`,
              color: aiLabel.color,
            }}
          >
            {aiLabel.text}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Score Cards */}
        <div className="grid grid-cols-5 gap-2">
          {dims.map((d) => (
            <div
              key={d.key}
              className={`rounded-md p-2.5 text-center border ${
                d.highlight
                  ? 'bg-[#00c896]/5 border-[#00c896]/15'
                  : 'bg-[#13131c] border-[#1a1a28]'
              }`}
            >
              <div className="text-[10px] text-[#5a5a68] mb-1 tracking-wider uppercase">
                {d.label}
              </div>
              <div
                className={`font-mono-data text-lg font-bold ${
                  d.highlight ? 'text-[#00c896]' : 'text-[#e8e8ed]'
                }`}
              >
                {d.score.toFixed(1)}
              </div>
            </div>
          ))}
        </div>

        {/* Tier & Feedback */}
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded"
            style={{
              backgroundColor: `${tier.color}12`,
              color: tier.color,
            }}
          >
            {tier.text}
          </span>
        </div>
        <p className="text-sm text-[#9a9aa8] leading-relaxed">
          {(corner as unknown as Record<string, unknown>).feedback as string || (meta as Record<string, unknown>).feedback as string || '暂无评价'}
        </p>

        {/* Flags */}
        <div>
          <div className="text-[10px] text-[#5a5a68] mb-2 tracking-wider uppercase flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            AI 检测到的特征
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {FLAG_ORDER.map((key) => {
              const active = activeFlags.includes(key);
              return (
                <div
                  key={key}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs border transition-colors ${
                    active
                      ? 'bg-red-500/5 border-red-500/20 text-red-300'
                      : 'bg-[#13131c] border-[#1a1a28] text-[#5a5a68]'
                  }`}
                >
                  {active ? (
                    <XCircle className="w-3.5 h-3.5 shrink-0 text-red-400" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-[#1e1e28]" />
                  )}
                  <span>{FLAG_LABELS[key]}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2">
          {statItems.map((s) => (
            <div
              key={s.label}
              className="rounded-md bg-[#13131c] border border-[#1a1a28] p-2.5 text-center"
            >
              <div className="flex items-center justify-center gap-1 text-[#5a5a68] mb-1">
                {s.icon}
                <span className="text-[10px] tracking-wider uppercase">{s.label}</span>
              </div>
              <div className="font-mono-data text-base font-semibold text-[#e8e8ed]">
                {s.value}
              </div>
              {s.unit && (
                <div className="text-[10px] text-[#5a5a68]">{s.unit}</div>
              )}
            </div>
          ))}
        </div>

        {/* Phase stats */}
        <div className="grid grid-cols-3 gap-2">
          {phases.map((p) => (
            <div
              key={p.label}
              className="rounded-md bg-[#13131c] border border-[#1a1a28] p-2.5 text-center"
            >
              <div className="text-[10px] text-[#5a5a68] mb-1 tracking-wider uppercase">
                {p.label}
              </div>
              <div className="font-mono-data text-lg font-bold text-[#e8e8ed]">
                {p.speed.toFixed(1)}
              </div>
              <div className="text-[10px] text-[#5a5a68]">km/h</div>
              <div className="mt-1.5 text-[10px] text-[#5a5a68] flex items-center justify-center gap-1">
                <Clock className="w-3 h-3" />
                {p.duration.toFixed(2)}s
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
