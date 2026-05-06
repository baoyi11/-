"""
segmentation.py
基于车辆动力学时序数据的弯道自动切分算法。

核心思路：
1. 利用横摆角速度 (Yaw Rate) 和方向盘转角 (Steering Angle) 检测转向事件
2. 结合侧向 G 值 (Lateral G) 确认车辆处于弯道负载状态
3. 将每个弯道拆分为：入弯 (Entry)、弯心 (Apex)、出弯 (Exit)
4. 直道 (Straight) 作为弯道之间的连接段
"""

import numpy as np
import pandas as pd
from typing import List, Dict, Any, Optional
from dataclasses import dataclass


@dataclass
class Segment:
    """赛道片段（直道或弯道）"""
    segment_type: str          # "straight" | "corner"
    start_idx: int
    end_idx: int
    start_dist: Optional[float]
    end_dist: Optional[float]
    sub_phases: Optional[Dict[str, Any]] = None  # 弯道子阶段
    meta: Optional[Dict[str, Any]] = None        # 片段元数据


def _find_col(mapping: Dict[str, str], key: str, df_cols: list) -> Optional[str]:
    """从列名映射中查找目标列"""
    if key in mapping:
        return mapping[key]
    # fallback: 直接匹配
    aliases = {
        "yaw_rate": ["yaw_rate", "yawrate", "yaw"],
        "steering_angle": ["steering_angle", "steering", "steer"],
        "lat_g": ["lat_g", "lateral_g", "latg", "g_lat"],
        "speed": ["speed", "velocity", "kmh"],
        "long_g": ["long_g", "longitudinal_g", "g_long"],
        "slip_ratio": ["slip_ratio", "slip"],
    }
    lower_map = {c.lower().replace(" ", "_"): c for c in df_cols}
    for alias in aliases.get(key, [key]):
        if alias in lower_map:
            return lower_map[alias]
    return None


def segment_track(
    df: pd.DataFrame,
    col_mapping: Dict[str, str],
    min_corner_duration: float = 1.0,   # 最短弯道时长 (秒)
    min_straight_duration: float = 0.8, # 最短直道时长 (秒)
    yaw_threshold: float = 0.08,        # 横摆角速度阈值 (rad/s)
    g_threshold: float = 0.15,          # 侧向 G 阈值 (g)
    fs: float = 20.0,                   # 采样频率
) -> List[Segment]:
    """
    自动将赛道切分为直道和弯道片段。

    参数:
        df: 遥测 DataFrame
        col_mapping: parser 返回的标准列映射
        min_corner_duration: 弯道最小持续时间（过滤抖动）
        min_straight_duration: 直道最小持续时间
        yaw_threshold: 判断"正在转向"的横摆角速度绝对值阈值
        g_threshold: 判断"有侧向负载"的侧向 G 绝对值阈值
        fs: 采样频率 (Hz)
    返回:
        Segment 列表
    """
    cols = list(df.columns)
    yaw_col = _find_col(col_mapping, "yaw_rate", cols)
    steer_col = _find_col(col_mapping, "steering_angle", cols)
    latg_col = _find_col(col_mapping, "lat_g", cols)
    speed_col = _find_col(col_mapping, "speed", cols)
    long_g_col = _find_col(col_mapping, "long_g", cols)
    slip_col = _find_col(col_mapping, "slip_ratio", cols)
    dist_col = _find_col(col_mapping, "distance", cols)
    if dist_col is None:
        # 尝试从原始列名找
        for c in cols:
            if c.lower() in ["distance", "dist", "lap_distance", "track_position"]:
                dist_col = c
                break

    n = len(df)
    if n < fs * 2:
        raise ValueError("数据过短，无法完成赛道切分。")

    # 构建转向指示信号
    # 条件：(|yaw| > yaw_threshold) AND (|lat_g| > g_threshold) AND (|steer| > threshold)
    turning = np.zeros(n, dtype=bool)
    if yaw_col and latg_col and steer_col:
        yaw = df[yaw_col].fillna(0).to_numpy()
        latg = df[latg_col].fillna(0).to_numpy()
        steer = df[steer_col].fillna(0).to_numpy()
        # 自动检测 steering 量纲：归一化 [-1,1] 或角度 [-360,360]
        steer_abs_max = float(np.nanmax(np.abs(steer))) if len(steer) > 0 else 0.0
        steer_threshold = 0.05 if steer_abs_max <= 1.5 else 5.0
        turning = (
            (np.abs(yaw) > yaw_threshold)
            & (np.abs(latg) > g_threshold)
            & (np.abs(steer) > steer_threshold)
        )
    elif yaw_col and latg_col:
        yaw = df[yaw_col].fillna(0).to_numpy()
        latg = df[latg_col].fillna(0).to_numpy()
        turning = (np.abs(yaw) > yaw_threshold) & (np.abs(latg) > g_threshold)
    elif latg_col:
        latg = df[latg_col].fillna(0).to_numpy()
        turning = np.abs(latg) > g_threshold
    else:
        # 兜底：如果没有关键列，整段视为直道
        return [Segment("straight", 0, n - 1, 0.0, 0.0)]

    # 形态学闭运算：先膨胀后腐蚀，消除短暂抖动
    # 简单实现：如果某点前后有转向，则认为是转向
    def morphological_close(arr: np.ndarray, kernel: int = 3) -> np.ndarray:
        out = arr.copy()
        half = kernel // 2
        for i in range(half, len(arr) - half):
            window = arr[i - half:i + half + 1]
            if window.any():
                out[i] = True
        return out

    turning = morphological_close(turning, kernel=max(3, int(fs * 0.3)))

    # 提取连续段
    segments: List[Segment] = []
    in_segment = turning[0]
    seg_start = 0

    for i in range(1, n):
        if turning[i] != in_segment:
            seg_type = "corner" if in_segment else "straight"
            segments.append(Segment(
                segment_type=seg_type,
                start_idx=seg_start,
                end_idx=i - 1,
                start_dist=None,
                end_dist=None,
            ))
            seg_start = i
            in_segment = turning[i]

    # 最后一段
    seg_type = "corner" if in_segment else "straight"
    segments.append(Segment(
        segment_type=seg_type,
        start_idx=seg_start,
        end_idx=n - 1,
        start_dist=None,
        end_dist=None,
    ))

    # 合并过短的片段（通常是噪声或连接段）
    merged: List[Segment] = []
    for seg in segments:
        duration = (seg.end_idx - seg.start_idx + 1) / fs
        if seg.segment_type == "corner" and duration < min_corner_duration:
            # 太短视为直道
            seg.segment_type = "straight"
        if seg.segment_type == "straight" and duration < min_straight_duration:
            # 太短视为弯道
            seg.segment_type = "corner"

        if merged and merged[-1].segment_type == seg.segment_type:
            merged[-1].end_idx = seg.end_idx
        else:
            merged.append(seg)

    segments = merged

    # 填充距离信息和元数据
    for seg in segments:
        s_idx, e_idx = seg.start_idx, seg.end_idx
        seg.start_dist = float(df.iloc[s_idx][dist_col]) if dist_col and dist_col in df.columns else None
        seg.end_dist = float(df.iloc[e_idx][dist_col]) if dist_col and dist_col in df.columns else None

        # 提取子阶段（仅弯道）
        if seg.segment_type == "corner":
            seg.sub_phases = _split_corner_phases(df, s_idx, e_idx, col_mapping, fs)

        # 提取片段统计信息
        seg.meta = {
            "duration_sec": round((e_idx - s_idx + 1) / fs, 2),
            "avg_speed": None,
            "max_lat_g": None,
            "avg_steering": None,
        }
        if speed_col and speed_col in df.columns:
            seg.meta["avg_speed"] = round(float(df[speed_col].iloc[s_idx:e_idx + 1].mean()), 2)
        if latg_col and latg_col in df.columns:
            seg.meta["max_lat_g"] = round(float(df[latg_col].iloc[s_idx:e_idx + 1].abs().max()), 3)
        if steer_col and steer_col in df.columns:
            seg.meta["avg_steering"] = round(float(df[steer_col].iloc[s_idx:e_idx + 1].abs().mean()), 2)

    # 过滤：首尾如果是直道且很短，可能属于进出站段，保留但标记
    return segments


def _split_corner_phases(
    df: pd.DataFrame,
    start_idx: int,
    end_idx: int,
    col_mapping: Dict[str, str],
    fs: float,
) -> Dict[str, Any]:
    """
    将一个弯道片段拆分为：入弯 (Entry)、弯心 (Apex)、出弯 (Exit)。

    规则：
    - Entry: 从开始到速度最低点或侧向 G 峰值前
    - Apex: 速度最低点附近或转向最急的区域
    - Exit: 剩余部分直到转向结束
    """
    cols = list(df.columns)
    speed_col = _find_col(col_mapping, "speed", cols)
    latg_col = _find_col(col_mapping, "lat_g", cols)
    steer_col = _find_col(col_mapping, "steering_angle", cols)
    long_g_col = _find_col(col_mapping, "long_g", cols)
    dist_col = _find_col(col_mapping, "distance", cols)

    n = end_idx - start_idx + 1
    if n < 3:
        return {"entry": [start_idx, end_idx], "apex": [start_idx, end_idx], "exit": [start_idx, end_idx]}

    # 找到速度最低点作为弯心候选
    apex_candidate = start_idx
    if speed_col and speed_col in df.columns:
        speed_seg = df[speed_col].iloc[start_idx:end_idx + 1].fillna(0).to_numpy()
        min_speed_idx = int(np.argmin(speed_seg))
        apex_candidate = start_idx + min_speed_idx
    else:
        # 无速度列时，取中点
        apex_candidate = start_idx + n // 2

    # 调整：如果侧向 G 峰值和速度最低点偏离较大，取中间
    if latg_col and latg_col in df.columns:
        latg_seg = df[latg_col].iloc[start_idx:end_idx + 1].fillna(0).to_numpy()
        max_latg_idx = int(np.argmax(np.abs(latg_seg)))
        # 弯心取速度最低点和 G 峰值的加权平均
        apex_candidate = int(0.6 * apex_candidate + 0.4 * (start_idx + max_latg_idx))

    # 定义三个阶段
    entry_end = apex_candidate
    exit_start = apex_candidate

    # 入弯：从开始到弯心前 20%（给弯心留空间）
    entry_margin = max(1, int(n * 0.15))
    entry_end = max(start_idx + entry_margin, apex_candidate - entry_margin)

    # 出弯：从弯心后 20% 到结束
    exit_start = min(end_idx - entry_margin, apex_candidate + entry_margin)

    # 确保顺序合法
    entry_end = max(entry_end, start_idx + 1)
    exit_start = min(exit_start, end_idx - 1)
    if entry_end >= exit_start:
        mid = (start_idx + end_idx) // 2
        entry_end = mid
        exit_start = mid

    phases = {
        "entry": [start_idx, entry_end],
        "apex": [entry_end, exit_start],
        "exit": [exit_start, end_idx],
    }

    # 为每个阶段提取关键指标
    for phase_name, (p_start, p_end) in list(phases.items()):
        phase_meta = {"duration_sec": round((p_end - p_start + 1) / fs, 2)}
        if speed_col and speed_col in df.columns:
            phase_meta["min_speed"] = round(float(df[speed_col].iloc[p_start:p_end + 1].min()), 2)
            phase_meta["avg_speed"] = round(float(df[speed_col].iloc[p_start:p_end + 1].mean()), 2)
        if latg_col and latg_col in df.columns:
            phase_meta["max_lat_g"] = round(float(df[latg_col].iloc[p_start:p_end + 1].abs().max()), 3)
        if long_g_col and long_g_col in df.columns:
            phase_meta["max_brake_g"] = round(float(df[long_g_col].iloc[p_start:p_end + 1].clip(upper=0).abs().max()), 3)
            phase_meta["max_throttle_g"] = round(float(df[long_g_col].iloc[p_start:p_end + 1].clip(lower=0).max()), 3)
        if steer_col and steer_col in df.columns:
            phase_meta["avg_steering"] = round(float(df[steer_col].iloc[p_start:p_end + 1].abs().mean()), 2)
        phases[f"{phase_name}_meta"] = phase_meta

    return phases
