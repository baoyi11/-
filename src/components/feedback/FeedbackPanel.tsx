'use client';

import React from 'react';
import { Trophy, AlertTriangle, Zap, Target, Gauge, Route } from 'lucide-react';

interface DimensionScores {
  braking?: number;
  mid_speed?: number;
  throttle?: number;
  racing_line?: number;
}

interface FeedbackData {
  tier: string;
  title: string;
  summary: string;
  roast: string;
  full_text: string;
  overall_score: number;
  dimension_scores: DimensionScores;
  worst_dimension: string | null;
  worst_dimension_score: number;
  corner_count: number;
}

interface FeedbackPanelProps {
  feedback: FeedbackData | null;
}

function scoreColor(score: number): string {
  if (score >= 85) return 'text-emerald-400';
  if (score >= 70) return 'text-cyan-400';
  if (score >= 55) return 'text-amber-400';
  return 'text-red-400';
}

function scoreBg(score: number): string {
  if (score >= 85) return 'bg-emerald-500/10 border-emerald-500/30';
  if (score >= 70) return 'bg-cyan-500/10 border-cyan-500/30';
  if (score >= 55) return 'bg-amber-500/10 border-amber-500/30';
  return 'bg-red-500/10 border-red-500/30';
}

function DimensionCard({
  label,
  score,
  icon,
}: {
  label: string;
  score: number;
  icon: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${scoreBg(score)}`}
    >
      <div className="text-slate-400">{icon}</div>
      <div className="flex-1">
        <p className="text-xs text-slate-400">{label}</p>
        <p className={`text-lg font-bold ${scoreColor(score)}`}>{score}</p>
      </div>
    </div>
  );
}

export default function FeedbackPanel({ feedback }: FeedbackPanelProps) {
  if (!feedback) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-2">
        <Gauge className="w-8 h-8 opacity-50" />
        <p className="text-sm">上传遥测数据以获取评价</p>
      </div>
    );
  }

  const ds = feedback.dimension_scores || {};

  return (
    <div className="w-full space-y-4">
      {/* 总分展示 */}
      <div className="flex items-center gap-4">
        <div
          className={`w-20 h-20 rounded-full flex items-center justify-center border-2 ${scoreBg(
            feedback.overall_score
          )}`}
        >
          <div className="text-center">
            <p className={`text-2xl font-black ${scoreColor(feedback.overall_score)}`}>
              {feedback.overall_score}
            </p>
            <p className="text-[10px] text-slate-400">总分</p>
          </div>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="w-4 h-4 text-amber-400" />
            <h3 className="text-lg font-bold text-slate-100">{feedback.title}</h3>
          </div>
          <p className="text-xs text-slate-400">
            共分析 {feedback.corner_count} 个弯道
          </p>
        </div>
      </div>

      {/* 维度卡片 */}
      <div className="grid grid-cols-2 gap-2">
        <DimensionCard
          label="刹车技术"
          score={ds.braking ?? 0}
          icon={<AlertTriangle className="w-4 h-4" />}
        />
        <DimensionCard
          label="弯心速度"
          score={ds.mid_speed ?? 0}
          icon={<Zap className="w-4 h-4" />}
        />
        <DimensionCard
          label="油门控制"
          score={ds.throttle ?? 0}
          icon={<Gauge className="w-4 h-4" />}
        />
        <DimensionCard
          label="走线精准"
          score={ds.racing_line ?? 0}
          icon={<Route className="w-4 h-4" />}
        />
      </div>

      {/* 总评文案 */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Target className="w-4 h-4 text-cyan-400" />
          <h4 className="text-sm font-semibold text-slate-200">教练点评</h4>
        </div>
        <p className="text-sm text-slate-300 leading-relaxed">{feedback.summary}</p>
        {feedback.roast && (
          <div className="mt-3 pt-3 border-t border-slate-700">
            <p className="text-xs text-amber-400 font-medium mb-1">精准吐槽</p>
            <p className="text-sm text-slate-300 leading-relaxed italic">
              &ldquo;{feedback.roast}&rdquo;
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
