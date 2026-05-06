'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize2, X } from 'lucide-react';

interface Point {
  x: number;
  y: number;
}

interface CornerInfo {
  corner_id: number;
  scores: {
    total: number;
  };
  indices: {
    start: number;
    end: number;
  };
  one_liner: string;
  ai_class?: string;
}

interface TrackMapProps {
  trajectory: Point[];
  corners: CornerInfo[];
  onCornerSelect?: (corner: CornerInfo) => void;
  selectedCornerId?: number | null;
}

function scoreToColor(score: number): string {
  if (score >= 85) return '#10b981'; // emerald-500
  if (score >= 70) return '#22d3ee'; // cyan-400
  if (score >= 55) return '#f59e0b'; // amber-500
  return '#ef4444'; // red-500
}

function scoreToLabel(score: number): string {
  if (score >= 85) return '完美';
  if (score >= 70) return '良好';
  if (score >= 55) return '一般';
  return '危险';
}

export default function TrackMap({
  trajectory,
  corners,
  onCornerSelect,
  selectedCornerId,
}: TrackMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredCorner, setHoveredCorner] = useState<CornerInfo | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const [modalCorner, setModalCorner] = useState<CornerInfo | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || trajectory.length < 2) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 计算变换参数
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of trajectory) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const margin = 40;
    const dataW = maxX - minX || 1;
    const dataH = maxY - minY || 1;
    const scaleX = (w - margin * 2) / dataW;
    const scaleY = (h - margin * 2) / dataH;
    const baseScale = Math.min(scaleX, scaleY);
    const scale = baseScale * zoom;

    const offsetX = (w - dataW * scale) / 2 - minX * scale + pan.x;
    const offsetY = (h - dataH * scale) / 2 - minY * scale + pan.y;

    const toCanvas = (p: Point) => ({
      x: p.x * scale + offsetX,
      y: h - (p.y * scale + offsetY),
    });

    // 清空
    ctx.clearRect(0, 0, w, h);

    // 背景网格
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
    ctx.lineWidth = 1;
    const gridSize = 50 * zoom;
    const gridOffsetX = offsetX % gridSize;
    const gridOffsetY = (h - offsetY) % gridSize;
    for (let x = gridOffsetX; x < w; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = gridOffsetY; y < h; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // 绘制完整轨迹（灰色底）
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 2;
    for (let i = 0; i < trajectory.length; i++) {
      const cp = toCanvas(trajectory[i]);
      if (i === 0) ctx.moveTo(cp.x, cp.y);
      else ctx.lineTo(cp.x, cp.y);
    }
    ctx.stroke();

    // 为每个弯道着色绘制轨迹段
    for (const corner of corners) {
      const startIdx = Math.max(0, Math.floor((corner.indices.start / (trajectory.length - 1)) * trajectory.length));
      const endIdx = Math.min(trajectory.length - 1, Math.ceil((corner.indices.end / (trajectory.length - 1)) * trajectory.length));

      if (endIdx <= startIdx) continue;

      const color = scoreToColor(corner.scores.total);
      const isSelected = selectedCornerId === corner.corner_id;

      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 6 : 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = isSelected ? 1.0 : 0.9;

      for (let i = startIdx; i <= endIdx; i++) {
        const cp = toCanvas(trajectory[i]);
        if (i === startIdx) ctx.moveTo(cp.x, cp.y);
        else ctx.lineTo(cp.x, cp.y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1.0;

      // 弯道中点标记（显示评分）
      const midIdx = Math.floor((startIdx + endIdx) / 2);
      const midP = toCanvas(trajectory[midIdx]);

      // 外圈光晕
      ctx.beginPath();
      ctx.fillStyle = color + '40';
      ctx.arc(midP.x, midP.y, isSelected ? 18 : 14, 0, Math.PI * 2);
      ctx.fill();

      // 主圆
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(midP.x, midP.y, isSelected ? 14 : 11, 0, Math.PI * 2);
      ctx.fill();

      // 边框
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 评分数字
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${isSelected ? 11 : 9}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.round(corner.scores.total)), midP.x, midP.y);
    }

    // 起点/终点标记
    if (trajectory.length > 0) {
      const startP = toCanvas(trajectory[0]);
      ctx.beginPath();
      ctx.fillStyle = '#22d3ee';
      ctx.arc(startP.x, startP.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('S', startP.x, startP.y);
    }
  }, [trajectory, corners, selectedCornerId, zoom, pan]);

  useEffect(() => {
    draw();
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  const getCornerAtPos = useCallback((x: number, y: number): CornerInfo | null => {
    if (!trajectory.length) return null;
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of trajectory) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const margin = 40;
    const dataW = maxX - minX || 1;
    const dataH = maxY - minY || 1;
    const scaleX = (w - margin * 2) / dataW;
    const scaleY = (h - margin * 2) / dataH;
    const baseScale = Math.min(scaleX, scaleY);
    const scale = baseScale * zoom;

    const offsetX = (w - dataW * scale) / 2 - minX * scale + pan.x;
    const offsetY = (h - dataH * scale) / 2 - minY * scale + pan.y;

    for (const corner of corners) {
      const midIdx = Math.floor(
        ((corner.indices.start + corner.indices.end) / 2 / (trajectory.length - 1)) * trajectory.length
      );
      if (midIdx < 0 || midIdx >= trajectory.length) continue;

      const cx = trajectory[midIdx].x * scale + offsetX;
      const cy = h - (trajectory[midIdx].y * scale + offsetY);

      const dist = Math.hypot(x - cx, y - cy);
      if (dist < 20) {
        return corner;
      }
    }
    return null;
  }, [trajectory, corners, zoom, pan]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setMousePos({ x: e.clientX, y: e.clientY });

      if (isDragging) {
        const dx = x - dragStart.current.x;
        const dy = y - dragStart.current.y;
        setPan({ x: panStart.current.x + dx, y: panStart.current.y + dy });
        return;
      }

      const found = getCornerAtPos(x, y);
      setHoveredCorner(found);
    },
    [isDragging, getCornerAtPos]
  );

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    dragStart.current = { x, y };
    panStart.current = { ...pan };
    setIsDragging(true);
  }, [pan]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleClick = useCallback(() => {
    if (hoveredCorner) {
      if (onCornerSelect) {
        onCornerSelect(hoveredCorner);
      }
      setModalCorner(hoveredCorner);
    }
  }, [hoveredCorner, onCornerSelect]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((prev) => Math.max(0.5, Math.min(5, prev * delta)));
  }, []);

  const zoomIn = () => setZoom((prev) => Math.min(5, prev * 1.2));
  const zoomOut = () => setZoom((prev) => Math.max(0.5, prev / 1.2));
  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const toggleFullscreen = () => {
    setIsFullscreen((prev) => !prev);
    setTimeout(() => draw(), 100);
  };

  return (
    <div className="relative w-full h-full min-h-[320px]">
      <div
        ref={containerRef}
        className={`relative w-full bg-slate-900 rounded-xl overflow-hidden border border-slate-700 ${
          isFullscreen ? 'fixed inset-4 z-50 h-auto' : 'h-full min-h-[320px]'
        }`}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ cursor: isDragging ? 'grabbing' : hoveredCorner ? 'pointer' : 'grab' }}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={handleClick}
          onWheel={handleWheel}
        />

        {/* 缩放控制按钮 */}
        <div className="absolute top-3 right-3 flex flex-col gap-1">
          <button
            onClick={zoomIn}
            className="w-8 h-8 rounded-lg bg-slate-800/90 border border-slate-600 flex items-center justify-center hover:bg-slate-700 transition-colors"
            title="放大"
          >
            <ZoomIn className="w-4 h-4 text-slate-300" />
          </button>
          <button
            onClick={zoomOut}
            className="w-8 h-8 rounded-lg bg-slate-800/90 border border-slate-600 flex items-center justify-center hover:bg-slate-700 transition-colors"
            title="缩小"
          >
            <ZoomOut className="w-4 h-4 text-slate-300" />
          </button>
          <button
            onClick={resetView}
            className="w-8 h-8 rounded-lg bg-slate-800/90 border border-slate-600 flex items-center justify-center hover:bg-slate-700 transition-colors text-[10px] text-slate-300 font-bold"
            title="重置视图"
          >
            1:1
          </button>
          <button
            onClick={toggleFullscreen}
            className="w-8 h-8 rounded-lg bg-slate-800/90 border border-slate-600 flex items-center justify-center hover:bg-slate-700 transition-colors"
            title="全屏"
          >
            <Maximize2 className="w-4 h-4 text-slate-300" />
          </button>
        </div>

        {/* 图例 */}
        <div className="absolute bottom-3 left-3 bg-slate-900/80 backdrop-blur px-3 py-2 rounded-lg border border-slate-700 text-xs">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-3 h-3 rounded-full bg-emerald-500" />
            <span className="text-slate-300">完美 (85+)</span>
          </div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-3 h-3 rounded-full bg-cyan-400" />
            <span className="text-slate-300">良好 (70-84)</span>
          </div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-3 h-3 rounded-full bg-amber-500" />
            <span className="text-slate-300">一般 (55-69)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-slate-300">危险 (&lt;55)</span>
          </div>
        </div>

        {/* 悬停提示 */}
        {hoveredCorner && mousePos && !modalCorner && (
          <div
            className="fixed z-50 pointer-events-none bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 shadow-xl"
            style={{
              left: mousePos.x + 12,
              top: mousePos.y - 12,
            }}
          >
            <p className="text-xs text-slate-400">弯道 #{hoveredCorner.corner_id}</p>
            <p className="text-sm font-bold" style={{ color: scoreToColor(hoveredCorner.scores.total) }}>
              {hoveredCorner.scores.total} 分 · {scoreToLabel(hoveredCorner.scores.total)}
            </p>
            <p className="text-xs text-slate-300 mt-1 max-w-[220px] leading-relaxed">{hoveredCorner.one_liner}</p>
          </div>
        )}

        {/* 全屏关闭按钮 */}
        {isFullscreen && (
          <button
            onClick={toggleFullscreen}
            className="absolute top-3 left-3 w-8 h-8 rounded-lg bg-slate-800/90 border border-slate-600 flex items-center justify-center hover:bg-slate-700 transition-colors"
            title="退出全屏"
          >
            <X className="w-4 h-4 text-slate-300" />
          </button>
        )}
      </div>

      {/* 弯道详情弹窗 */}
      {modalCorner && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setModalCorner(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-100">
                弯道 #{modalCorner.corner_id}
              </h3>
              <button
                onClick={() => setModalCorner(null)}
                className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center hover:bg-slate-700 transition-colors"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="flex items-center gap-4 mb-4">
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-black shadow-lg"
                style={{
                  backgroundColor: scoreToColor(modalCorner.scores.total) + '20',
                  color: scoreToColor(modalCorner.scores.total),
                  border: `2px solid ${scoreToColor(modalCorner.scores.total)}`,
                }}
              >
                {Math.round(modalCorner.scores.total)}
              </div>
              <div>
                <p className="text-2xl font-bold" style={{ color: scoreToColor(modalCorner.scores.total) }}>
                  {scoreToLabel(modalCorner.scores.total)}
                </p>
                {modalCorner.ai_class && (
                  <p className="text-xs text-slate-500 mt-1">
                    AI 分类: <span className="text-slate-300">{modalCorner.ai_class}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <p className="text-sm text-slate-300 leading-relaxed">{modalCorner.one_liner}</p>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  if (onCornerSelect) onCornerSelect(modalCorner);
                  setModalCorner(null);
                }}
                className="flex-1 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold transition-colors"
              >
                查看完整详情
              </button>
              <button
                onClick={() => setModalCorner(null)}
                className="px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-sm font-semibold hover:bg-slate-700 transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
