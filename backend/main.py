"""
main.py
赛道级虚拟赛车教练 - FastAPI 后端服务入口

API 列表:
- POST /api/upload      : 上传 CSV 遥测文件
- POST /api/analyze     : 解析并分析遥测数据
- GET  /api/health      : 健康检查
"""

import os
import sys
import io
import traceback
from typing import Optional

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# 将 backend 目录加入路径（确保模型导入正常）
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from core.parser import parse_telemetry_csv
from core.segmentation import segment_track
from core.evaluator import load_model, evaluate_corner
from core.feedback import generate_feedback, generate_corner_feedback


# ==================== FastAPI App ====================
app = FastAPI(
    title="赛道级虚拟赛车教练 API",
    description="基于深度学习与车辆动力学的弯道动态评价系统",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== 全局模型实例 ====================
_model = None
_model_device = "cpu"


def get_model():
    """懒加载模型"""
    global _model
    if _model is None:
        try:
            _model = load_model(device=_model_device)
        except Exception as e:
            print(f"[WARN] Model load failed: {e}")
            _model = None
    return _model


# ==================== Pydantic Models ====================
class AnalyzeResponse(BaseModel):
    status: str
    meta: dict
    segments: list
    corners: list
    feedback: dict


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool


# ==================== API Routes ====================
@app.get("/api/health", response_model=HealthResponse)
async def health():
    """服务健康检查"""
    model = get_model()
    return {
        "status": "ok",
        "model_loaded": model is not None,
    }


@app.post("/api/upload")
async def upload_csv(file: UploadFile = File(...)):
    """
    上传 CSV 遥测文件并返回解析摘要。
    """
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="仅支持 CSV 文件上传")

    try:
        contents = await file.read()
        parsed = parse_telemetry_csv(contents)
        return {
            "status": "ok",
            "filename": file.filename,
            "meta": parsed["meta"],
            "columns": list(parsed["raw_df"].columns),
            "col_mapping": parsed["col_mapping"],
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=f"文件解析失败: {str(e)}")


@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...)):
    """
    上传 CSV 并进行完整的弯道分析与评价。

    返回:
    - meta: 文件元信息
    - segments: 赛道切分结果（直道/弯道）
    - corners: 每个弯道的详细评价
    - feedback: 综合反馈文案
    - trajectory: 轨迹坐标（用于前端地图绘制）
    - telemetry: 关键遥测序列（用于前端图表）
    """
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="仅支持 CSV 文件上传")

    try:
        contents = await file.read()
        parsed = parse_telemetry_csv(contents)
        df = parsed["raw_df"]
        col_mapping = parsed["col_mapping"]
        meta = parsed["meta"]

        # 弯道切分
        fs = meta.get("sampling_rate_hz", 20.0)
        segments = segment_track(df, col_mapping, fs=fs)

        # 提取弯道并进行 AI/物理评价
        model = get_model()
        corners = []
        for seg in segments:
            if seg.segment_type == "corner":
                result = evaluate_corner(df, seg, col_mapping, model=model)
                result["one_liner"] = generate_corner_feedback(result)
                corners.append(result)

        # 综合反馈
        feedback = generate_feedback(corners)

        # 提取轨迹坐标用于前端地图
        pos_cols = parsed.get("pos_cols", {})
        trajectory = []
        if "x" in pos_cols and "y" in pos_cols:
            x_col, y_col = pos_cols["x"], pos_cols["y"]
            if x_col in df.columns and y_col in df.columns:
                xs = df[x_col].fillna(0).tolist()
                ys = df[y_col].fillna(0).tolist()
                # 下采样以减少传输量
                step = max(1, len(xs) // 2000)
                trajectory = [{"x": xs[i], "y": ys[i]} for i in range(0, len(xs), step)]

        # 提取关键遥测序列用于前端图表
        telemetry = _extract_telemetry_series(df, col_mapping)

        # 序列化 segments（移除 DataFrame 引用）
        serializable_segments = []
        for seg in segments:
            serializable_segments.append({
                "type": seg.segment_type,
                "start_idx": seg.start_idx,
                "end_idx": seg.end_idx,
                "start_dist": seg.start_dist,
                "end_dist": seg.end_dist,
                "meta": seg.meta,
                "sub_phases": seg.sub_phases,
            })

        return {
            "status": "ok",
            "meta": meta,
            "segments": serializable_segments,
            "corners": corners,
            "feedback": feedback,
            "trajectory": trajectory,
            "telemetry": telemetry,
        }

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"分析失败: {str(e)}")


def _extract_telemetry_series(df, col_mapping: dict) -> dict:
    """提取前端图表所需的关键遥测序列"""
    cols = list(df.columns)

    def get_col(key: str) -> Optional[str]:
        if key in col_mapping:
            return col_mapping[key]
        for c in cols:
            if c.lower().replace(" ", "_") == key:
                return c
        return None

    series = {}
    for key, label in [
        ("speed", "speed"),
        ("lat_g", "lat_g"),
        ("long_g", "long_g"),
        ("steering_angle", "steering"),
        ("yaw_rate", "yaw_rate"),
        ("slip_ratio", "slip_ratio"),
    ]:
        col = get_col(key)
        if col and col in df.columns:
            arr = df[col].fillna(0).to_numpy()
            # 下采样
            step = max(1, len(arr) // 3000)
            series[label] = [float(v) for v in arr[::step]]

    # 统一 x 轴（距离或索引）
    dist_col = None
    for c in cols:
        if c.lower() in ["distance", "dist", "lap_distance", "track_position"]:
            dist_col = c
            break
    if dist_col and dist_col in df.columns:
        arr = df[dist_col].fillna(0).to_numpy()
        step = max(1, len(arr) // 3000)
        series["distance"] = [float(v) for v in arr[::step]]
    else:
        # 用索引
        n = len(df)
        step = max(1, n // 3000)
        series["distance"] = list(range(0, n, step))

    return series


# ==================== 启动入口 ====================
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=False)
