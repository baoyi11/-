"""
parser.py
遥测 CSV 数据解析模块。
支持多种赛车游戏导出的 CSV 格式，自动识别列名并提取关键动力学特征。
"""

import io
import pandas as pd
import numpy as np
from typing import Optional, Dict, Any


# 允许的时间列别名
TIME_ALIASES = ["time", "timestamp", "t", "lap_time", "session_time", "seconds"]
# 允许的距离列别名
DIST_ALIASES = ["distance", "dist", "lap_distance", "track_position", "s", "meter"]
# 允许的位置列别名
POS_X_ALIASES = ["x", "pos_x", "world_x", "position_x", "local_x", "coordinate_x"]
POS_Y_ALIASES = ["y", "pos_y", "world_y", "position_y", "local_y", "coordinate_y"]
POS_Z_ALIASES = ["z", "pos_z", "world_z", "position_z", "local_z", "coordinate_z"]


def _find_column(candidates: list, df_cols: list) -> Optional[str]:
    """在 DataFrame 列中查找匹配候选名的列（大小写不敏感）"""
    lower_map = {c.lower().replace(" ", "_"): c for c in df_cols}
    for cand in candidates:
        if cand in lower_map:
            return lower_map[cand]
    return None


def parse_telemetry_csv(file_bytes: bytes) -> Dict[str, Any]:
    """
    解析上传的 CSV 遥测文件。

    Args:
        file_bytes: 文件二进制内容
    Returns:
        dict 包含:
            - raw_df: 原始 DataFrame
            - features: 特征矩阵 (np.ndarray)
            - time_col: 时间列名或 None
            - dist_col: 距离列名或 None
            - pos_cols: 位置列名字典 {x, y, z}
            - col_mapping: 标准特征到原始列的映射
            - meta: 元信息 (行数, 时长估算等)
    """
    # 尝试多种编码和分隔符
    encodings = ["utf-8", "latin1", "cp1252"]
    delimiters = [",", ";", "\t"]
    raw_df = None

    for enc in encodings:
        for sep in delimiters:
            try:
                raw_df = pd.read_csv(io.BytesIO(file_bytes), sep=sep, encoding=enc)
                if raw_df.shape[1] >= 3:
                    break
            except Exception:
                continue
        if raw_df is not None and raw_df.shape[1] >= 3:
            break

    if raw_df is None or raw_df.shape[1] < 3:
        raise ValueError("无法解析 CSV 文件，请检查格式。需要至少包含 3 列数据。")

    df = raw_df.copy()
    cols = list(df.columns)

    # 识别时间列
    time_col = _find_column(TIME_ALIASES, cols)

    # 识别距离列
    dist_col = _find_column(DIST_ALIASES, cols)

    # 识别位置列
    pos_x = _find_column(POS_X_ALIASES, cols)
    pos_y = _find_column(POS_Y_ALIASES, cols)
    pos_z = _find_column(POS_Z_ALIASES, cols)

    # 尝试将所有列转换为数值型，无法转换的保留
    for c in df.columns:
        df[c] = pd.to_numeric(df[c], errors="coerce")

    # 移除完全为空的列
    df = df.dropna(axis=1, how="all")

    # 估算采样频率
    fs = 20.0  # 默认 20Hz
    if time_col and df[time_col].notna().sum() > 1:
        t_valid = df[time_col].dropna()
        if len(t_valid) > 1:
            dt = float(t_valid.diff().dropna().median())
            if dt > 0:
                fs = 1.0 / dt

    # 估算总时长和总距离
    duration = None
    total_dist = None
    if time_col:
        t_valid = df[time_col].dropna()
        if len(t_valid) > 1:
            duration = float(t_valid.iloc[-1] - t_valid.iloc[0])
    if dist_col:
        d_valid = df[dist_col].dropna()
        if len(d_valid) > 1:
            total_dist = float(d_valid.iloc[-1] - d_valid.iloc[0])

    # 构建位置列字典
    pos_cols = {}
    if pos_x:
        pos_cols["x"] = pos_x
    if pos_y:
        pos_cols["y"] = pos_y
    if pos_z:
        pos_cols["z"] = pos_z

    # 如果只有 x, z（常见游戏坐标系），把 z 当作平面 y
    if "x" in pos_cols and "y" not in pos_cols and "z" in pos_cols:
        pos_cols["y"] = pos_cols.pop("z")
        pos_cols["z"] = None

    meta = {
        "rows": int(len(df)),
        "columns": int(df.shape[1]),
        "sampling_rate_hz": round(fs, 2),
        "duration_sec": round(duration, 2) if duration else None,
        "total_distance": round(total_dist, 2) if total_dist else None,
        "has_position": len(pos_cols) >= 2,
    }

    # 提取特征矩阵 (用于模型输入)
    from models.corner_net import TelemetryFeatureExtractor
    col_mapping = TelemetryFeatureExtractor.normalize_columns(df.columns)
    features = TelemetryFeatureExtractor.extract_sequence(df, col_mapping, seq_len=128)
    # 兼容 torch Tensor 和 numpy ndarray
    if hasattr(features, 'numpy'):
        features_np = features.numpy()
    else:
        features_np = features

    return {
        "raw_df": df,
        "features": features_np,
        "time_col": time_col,
        "dist_col": dist_col,
        "pos_cols": pos_cols,
        "col_mapping": col_mapping,
        "meta": meta,
    }
