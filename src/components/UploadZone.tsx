'use client';

import React, { useCallback, useState } from 'react';
import { Upload, FileCheck, Loader2 } from 'lucide-react';

interface UploadZoneProps {
  onAnalyze: (file: File) => void;
  isLoading: boolean;
}

export default function UploadZone({ onAnalyze, isLoading }: UploadZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        if (file.name.toLowerCase().endsWith('.csv')) {
          setFileName(file.name);
          onAnalyze(file);
        }
      }
    },
    [onAnalyze]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        setFileName(files[0].name);
        onAnalyze(files[0]);
      }
    },
    [onAnalyze]
  );

  return (
    <div
      className={`
        relative border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-300
        ${dragOver ? 'border-cyan-400 bg-cyan-950/30 scale-[1.02]' : 'border-slate-600 bg-slate-900/50'}
        ${isLoading ? 'opacity-70 pointer-events-none' : 'hover:border-slate-400 cursor-pointer'}
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept=".csv"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        onChange={handleFileChange}
        disabled={isLoading}
      />

      <div className="flex flex-col items-center gap-3">
        {isLoading ? (
          <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
        ) : fileName ? (
          <FileCheck className="w-10 h-10 text-emerald-400" />
        ) : (
          <Upload className="w-10 h-10 text-slate-400" />
        )}

        <div>
          {isLoading ? (
            <p className="text-cyan-300 font-medium">正在分析遥测数据...</p>
          ) : fileName ? (
            <p className="text-emerald-300 font-medium">{fileName}</p>
          ) : (
            <>
              <p className="text-slate-200 font-medium text-lg">
                拖拽 CSV 遥测文件到此处
              </p>
              <p className="text-slate-500 text-sm mt-1">
                或点击上传 · 支持 Assetto Corsa / F1 系列等格式
              </p>
            </>
          )}
        </div>

        {!isLoading && !fileName && (
          <div className="flex gap-2 mt-2">
            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-xs">
              Speed
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-xs">
              Yaw Rate
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-xs">
              G-Force
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-xs">
              Steering
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
