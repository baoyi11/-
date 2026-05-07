'use client';

import React, { useCallback, useState } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, Download, Gauge } from 'lucide-react';

interface UploadZoneProps {
  onUpload?: (file: File) => void;
  onAnalyze?: (file: File) => void;
  isLoading: boolean;
  error?: string | null;
}

export default function UploadZone({ onUpload, onAnalyze, isLoading, error }: UploadZoneProps) {
  const handleFile = onAnalyze || onUpload || (() => {});
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        const file = e.dataTransfer.files[0];
        setFileName(file.name);
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.preventDefault();
      if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        setFileName(file.name);
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleDemoDownload = useCallback(() => {
    const link = document.createElement('a');
    link.href = '/demo_telemetry.csv';
    link.download = 'demo_telemetry.csv';
    link.click();
  }, []);

  const handleTestDownload = useCallback(() => {
    const link = document.createElement('a');
    link.href = '/test_telemetry.csv';
    link.download = 'test_telemetry.csv';
    link.click();
  }, []);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#00c896]/10 border border-[#00c896]/20 text-[#00c896] text-xs font-medium tracking-wider uppercase mb-4">
          <Gauge className="w-3 h-3" />
          AI Racing Telemetry
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-[#e8e8ed] mb-2">
          赛道级虚拟赛车教练
        </h1>
        <p className="text-sm text-[#5a5a68]">
          上传 CSV 遥测数据，AI 自动分析每个弯道的驾驶表现
        </p>
      </div>

      <div
        className={`
          relative rounded-lg border border-dashed transition-all duration-300 cursor-pointer
          ${dragActive
            ? 'border-[#00c896]/50 bg-[#00c896]/5'
            : 'border-[#1a1a28] bg-[#0c0c12] hover:border-[#2a2a38] hover:bg-[#101018]'
          }
          ${isLoading ? 'opacity-60 pointer-events-none' : ''}
        `}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => document.getElementById('csv-upload')?.click()}
      >
        <input
          id="csv-upload"
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleChange}
          disabled={isLoading}
        />
        <div className="flex flex-col items-center justify-center py-12 px-4">
          <div className={`
            w-14 h-14 rounded-lg flex items-center justify-center mb-4 transition-all duration-300
            ${dragActive ? 'bg-[#00c896]/15 text-[#00c896]' : 'bg-[#13131c] text-[#5a5a68]'}
          `}>
            <Upload className="w-6 h-6" />
          </div>
          <p className="text-sm font-medium text-[#e8e8ed] mb-1">
            {fileName || '拖拽或点击上传 CSV 文件'}
          </p>
          <p className="text-xs text-[#5a5a68]">
            {fileName ? '已选择文件' : '仅支持 CSV 格式，最大 50MB'}
          </p>
          {fileName && (
            <div className="mt-3 flex items-center gap-2 text-xs text-[#00c896]">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{fileName}</span>
            </div>
          )}
          {isLoading && (
            <div className="mt-4 flex items-center gap-2 text-xs text-[#5a5a68]">
              <div className="w-4 h-4 border-2 border-[#00c896]/30 border-t-[#00c896] rounded-full animate-spin" />
              <span>正在分析遥测数据...</span>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      <div className="mt-4 flex items-center justify-center gap-3">
        <button
          onClick={handleDemoDownload}
          className="inline-flex items-center gap-1.5 text-xs text-[#5a5a68] hover:text-[#e8e8ed] transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          下载 Demo CSV
        </button>
        <span className="text-[#1a1a28]">|</span>
        <button
          onClick={handleTestDownload}
          className="inline-flex items-center gap-1.5 text-xs text-[#5a5a68] hover:text-[#e8e8ed] transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          下载测试 CSV
        </button>
      </div>
    </div>
  );
}
