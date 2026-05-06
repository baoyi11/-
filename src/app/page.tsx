'use client';

import React, { useState, useCallback } from 'react';
import { Activity, ChevronRight } from 'lucide-react';

import UploadZone from '@/components/UploadZone';
import TrackMap from '@/components/track/TrackMap';
import FrictionCircle from '@/components/telemetry/FrictionCircle';
import TelemetryCharts from '@/components/telemetry/TelemetryCharts';
import FeedbackPanel from '@/components/feedback/FeedbackPanel';
import CornerDetailPanel from '@/components/feedback/CornerDetailPanel';
import DimensionRadarChart from '@/components/RadarChart';

interface AnalysisResult {
  meta: {
    rows: number;
    sampling_rate_hz: number;
    duration_sec: number | null;
    total_distance: number | null;
  };
  segments: Array<{
    type: string;
    start_idx: number;
    end_idx: number;
    start_dist: number | null;
    end_dist: number | null;
    meta: Record<string, unknown>;
    sub_phases: Record<string, unknown>;
  }>;
  corners: Array<{
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
  }>;
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
    corner_count: number;
  };
  trajectory: Array<{ x: number; y: number }>;
  telemetry: {
    distance?: number[];
    speed?: number[];
    lat_g?: number[];
    long_g?: number[];
    steering?: number[];
    yaw_rate?: number[];
    slip_ratio?: number[];
  };
}

export default function HomePage() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [selectedCorner, setSelectedCorner] = useState<AnalysisResult['corners'][0] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    setSelectedCorner(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/py/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `分析失败: ${res.status}`);
      }

      const data = await res.json();
      if (data.status !== 'ok') {
        throw new Error(data.detail || '分析返回异常状态');
      }

      setResult(data);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const cornerRanges = result?.corners.map((c) => ({
    start: c.indices.start,
    end: c.indices.end,
    score: c.scores.total,
  }));

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">
              赛道级虚拟赛车教练
            </h1>
            <p className="text-[11px] text-slate-500 hidden sm:block">
              AI 驱动的弯道动态评价系统 · 基于 LSTM 与车辆动力学
            </p>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Upload Area */}
        <section>
          <UploadZone onAnalyze={handleAnalyze} isLoading={isLoading} />
          {error && (
            <div className="mt-3 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
              {error}
            </div>
          )}
        </section>

        {result && (
          <>
            {/* Meta Summary */}
            <section className="flex flex-wrap gap-3">
              <div className="bg-slate-900/50 border border-slate-800 rounded-lg px-4 py-2">
                <span className="text-xs text-slate-500">采样点</span>
                <p className="text-sm font-semibold text-slate-200">{result.meta.rows.toLocaleString()}</p>
              </div>
              <div className="bg-slate-900/50 border border-slate-800 rounded-lg px-4 py-2">
                <span className="text-xs text-slate-500">采样率</span>
                <p className="text-sm font-semibold text-slate-200">{result.meta.sampling_rate_hz} Hz</p>
              </div>
              {result.meta.duration_sec && (
                <div className="bg-slate-900/50 border border-slate-800 rounded-lg px-4 py-2">
                  <span className="text-xs text-slate-500">时长</span>
                  <p className="text-sm font-semibold text-slate-200">{result.meta.duration_sec.toFixed(1)}s</p>
                </div>
              )}
              {result.meta.total_distance && (
                <div className="bg-slate-900/50 border border-slate-800 rounded-lg px-4 py-2">
                  <span className="text-xs text-slate-500">距离</span>
                  <p className="text-sm font-semibold text-slate-200">{result.meta.total_distance.toFixed(0)}m</p>
                </div>
              )}
              <div className="bg-slate-900/50 border border-slate-800 rounded-lg px-4 py-2">
                <span className="text-xs text-slate-500">弯道数</span>
                <p className="text-sm font-semibold text-slate-200">{result.corners.length}</p>
              </div>
            </section>

            {/* Main Dashboard */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left: Track Map + Telemetry */}
              <div className="lg:col-span-8 space-y-6">
                {/* Track Map */}
                <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                      <ChevronRight className="w-4 h-4 text-cyan-400" />
                      赛道轨迹与弯道热力图
                    </h2>
                    <span className="text-xs text-slate-500">
                      点击弯道标记查看详情
                    </span>
                  </div>
                  <div className="h-[360px]">
                    <TrackMap
                      trajectory={result.trajectory}
                      corners={result.corners}
                      onCornerSelect={(c) => {
                        const full = result.corners.find((rc) => rc.corner_id === c.corner_id) || null;
                        setSelectedCorner(full);
                      }}
                      selectedCornerId={selectedCorner?.corner_id ?? null}
                    />
                  </div>
                </div>

                {/* Telemetry Charts */}
                <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
                  <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-3">
                    <ChevronRight className="w-4 h-4 text-cyan-400" />
                    遥测时序面板
                  </h2>
                  <div className="min-h-[460px]">
                    <TelemetryCharts
                      data={result.telemetry}
                      cornerRanges={cornerRanges}
                    />
                  </div>
                </div>
              </div>

              {/* Right: Feedback + Radar + Friction Circle */}
              <div className="lg:col-span-4 space-y-6">
                {/* Feedback */}
                <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
                  <FeedbackPanel feedback={result.feedback} />
                </div>

                {/* Radar Chart */}
                <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
                  <h3 className="text-sm font-bold text-slate-200 mb-2">维度雷达图</h3>
                  <div className="h-[260px]">
                    <DimensionRadarChart scores={result.feedback.dimension_scores} />
                  </div>
                </div>

                {/* Friction Circle */}
                <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
                  <h3 className="text-sm font-bold text-slate-200 mb-2">G 值摩擦圆</h3>
                  <div className="h-[260px]">
                    <FrictionCircle
                      latG={result.telemetry.lat_g || []}
                      longG={result.telemetry.long_g || []}
                    />
                  </div>
                </div>

                {/* Selected Corner Detail */}
                {selectedCorner && (
                  <CornerDetailPanel
                    corner={selectedCorner}
                    onClose={() => setSelectedCorner(null)}
                  />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
