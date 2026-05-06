'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';

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

    // 计算边界
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
    const scale = Math.min(scaleX, scaleY);

    const offsetX = (w - dataW * scale) / 2 - minX * scale;
    const offsetY = (h - dataH * scale) / 2 - minY * scale;

    const toCanvas = (p: Point) => ({
      x: p.x * scale + offsetX,
      y: h - (p.y * scale + offsetY), // Y轴翻转，通常游戏坐标系Y向上
    });

    // 清空
    ctx.clearRect(0, 0, w, h);

    // 背景网格
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
    ctx.lineWidth = 1;
    const gridSize = 50;
    for (let x = 0; x < w; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += gridSize) {
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
      ctx.lineWidth = isSelected ? 5 : 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = isSelected ? 1.0 : 0.85;

      for (let i = startIdx; i <= endIdx; i++) {
        const cp = toCanvas(trajectory[i]);
        if (i === startIdx) ctx.moveTo(cp.x, cp.y);
        else ctx.lineTo(cp.x, cp.y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1.0;

      // 弯道中点标记
      const midIdx = Math.floor((startIdx + endIdx) / 2);
      const midP = toCanvas(trajectory[midIdx]);
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(midP.x, midP.y, isSelected ? 7 : 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 编号
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(corner.corner_id), midP.x, midP.y);
    }

    // 起点/终点标记
    if (trajectory.length > 0) {
      const startP = toCanvas(trajectory[0]);
      ctx.beginPath();
      ctx.fillStyle = '#22d3ee';
      ctx.arc(startP.x, startP.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText('S', startP.x, startP.y);
    }
  }, [trajectory, corners, selectedCornerId]);

  useEffect(() => {
    draw();
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || trajectory.length < 2) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setMousePos({ x: e.clientX, y: e.clientY });

      // 检测是否悬停在弯道标记上
      let found: CornerInfo | null = null;
      for (const corner of corners) {
        const midIdx = Math.floor(
          ((corner.indices.start + corner.indices.end) / 2 / (trajectory.length - 1)) * trajectory.length
        );
        if (midIdx < 0 || midIdx >= trajectory.length) continue;

        const container = containerRef.current;
        if (!container) continue;
        const cRect = container.getBoundingClientRect();
        const w = cRect.width;
        const h = cRect.height;

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
        const scale = Math.min(scaleX, scaleY);
        const offsetX = (w - dataW * scale) / 2 - minX * scale;
        const offsetY = (h - dataH * scale) / 2 - minY * scale;

        const cx = trajectory[midIdx].x * scale + offsetX;
        const cy = h - (trajectory[midIdx].y * scale + offsetY);

        const dist = Math.hypot(x - cx, y - cy);
        if (dist < 12) {
          found = corner;
          break;
        }
      }
      setHoveredCorner(found);
    },
    [trajectory, corners]
  );

  const handleClick = useCallback(() => {
    if (hoveredCorner && onCornerSelect) {
      onCornerSelect(hoveredCorner);
    }
  }, [hoveredCorner, onCornerSelect]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-[320px] bg-slate-900 rounded-xl overflow-hidden border border-slate-700"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ cursor: hoveredCorner ? 'pointer' : 'default' }}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
      />

      {/* 图例 */}
      <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur px-3 py-2 rounded-lg border border-slate-700 text-xs">
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
      {hoveredCorner && mousePos && (
        <div
          className="fixed z-50 pointer-events-none bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 shadow-xl"
          style={{
            left: mousePos.x + 12,
            top: mousePos.y - 12,
          }}
        >
          <p className="text-xs text-slate-400">弯道 #{hoveredCorner.corner_id}</p>
          <p className="text-sm font-bold" style={{ color: scoreToColor(hoveredCorner.scores.total) }}>
            {hoveredCorner.scores.total} 分
          </p>
          <p className="text-xs text-slate-300 mt-1 max-w-[200px]">{hoveredCorner.one_liner}</p>
        </div>
      )}
    </div>
  );
}
