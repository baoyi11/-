"""
evaluator.py
弯道动态评价引擎。

结合物理规则与 AI 预测，对每一个弯道片段进行多维度打分：
- 刹车技术 (Braking & Trail-braking): 25%
- 弯心速度 (Mid-corner Speed): 25%
- 油门控制 (Throttle Application): 25%
- 走线精准度 (Racing Line): 25%

总分 = 加权平均，同时根据物理特征检测具体的失误模式。
"""

import numpy as np
import pandas as pd
from typing import Dict, Any, List, Optional

try:
    import torch
    _HAS_TORCH = True
except ImportError:
    _HAS_TORCH = False
    torch = None  # type: ignore

from models.corner_net import build_model, TelemetryFeatureExtractor, _HAS_TORCH as _MODEL_HAS_TORCH
from core.segmentation import Segment


# 模型权重文件路径（相对于 backend 目录）
MODEL_PATH = "models/corner_net.pth"


def load_model(device: str = "cpu") -> any:
    """加载预训练的 LSTM 模型"""
    if not _MODEL_HAS_TORCH:
        return None
    model = build_model(device=device)
    if model is None:
        return None
    try:
        model.load_state_dict(torch.load(MODEL_PATH, map_location=device, weights_only=True))
        model.eval()
    except FileNotFoundError:
        pass
    return model


def evaluate_corner(
    df: pd.DataFrame,
    seg: Segment,
    col_mapping: Dict[str, str],
    model: Optional[any] = None,
    device: str = "cpu",
) -> Dict[str, Any]:
    """
    对单个弯道片段进行完整评价。

    返回:
        {
            "corner_id": int,
            "ai_class": str,           # Understeer / Oversteer / Perfect
            "ai_confidence": float,
            "scores": {
                "braking": float,      # 0-100
                "mid_speed": float,    # 0-100
                "throttle": float,     # 0-100
                "racing_line": float,  # 0-100
                "total": float,        # 加权总分
            },
            "flags": {
                "brake_too_early": bool,
                "brake_too_late_or_lockup": bool,
                "throttle_choppy": bool,
                "throttle_too_early_full": bool,
                "missed_apex": bool,
                "over_slow": bool,
            },
            "phase_stats": dict,       # 入弯/弯心/出弯统计
        }
    """
    # 构建模型输入
    corner_df = df.iloc[seg.start_idx:seg.end_idx + 1].copy()
    features = TelemetryFeatureExtractor.extract_sequence(corner_df, col_mapping, seq_len=128)
    if _MODEL_HAS_TORCH and torch is not None and isinstance(features, torch.Tensor):
        features = features.to(device)

    # AI 预测
    ai_class = "Unknown"
    ai_confidence = 0.0
    class_names = ["Understeer", "Oversteer", "Perfect"]
    if model is not None and _MODEL_HAS_TORCH and torch is not None:
        probs = model.predict_proba(features)
        pred_idx = int(torch.argmax(probs, dim=-1).item())
        ai_class = class_names[pred_idx]
        ai_confidence = round(float(probs[0][pred_idx].item()), 4)

    # 基于物理规则的评分
    scores, flags = _physics_based_scoring(df, seg, col_mapping)

    # 如果 AI 预测为 Perfect 但物理评分很低，以物理评分为准（避免过拟合假阳性）
    if ai_class == "Perfect" and scores["total"] < 70:
        ai_class = "Understeer" if scores["racing_line"] < scores["throttle"] else "Oversteer"
        ai_confidence = 0.5

    result = {
        "corner_id": seg.start_idx,
        "ai_class": ai_class,
        "ai_confidence": ai_confidence,
        "scores": scores,
        "flags": flags,
        "phase_stats": seg.sub_phases or {},
        "meta": seg.meta or {},
        "indices": {
            "start": seg.start_idx,
            "end": seg.end_idx,
            "start_dist": seg.start_dist,
            "end_dist": seg.end_dist,
        },
    }
    return result


def _physics_based_scoring(
    df: pd.DataFrame,
    seg: Segment,
    col_mapping: Dict[str, str],
) -> tuple:
    """
    基于车辆动力学物理规则的评分和失误检测。
    返回 (scores_dict, flags_dict)。
    """
    cols = list(df.columns)

    def find_col(key: str) -> Optional[str]:
        if key in col_mapping:
            return col_mapping[key]
        for c in cols:
            if c.lower().replace(" ", "_") == key:
                return c
        return None

    speed_col = find_col("speed")
    latg_col = find_col("lat_g")
    long_g_col = find_col("long_g")
    steer_col = find_col("steering_angle")
    slip_col = find_col("slip_ratio")

    s_idx, e_idx = seg.start_idx, seg.end_idx
    n = e_idx - s_idx + 1
    if n < 3:
        return {
            "braking": 50, "mid_speed": 50, "throttle": 50,
            "racing_line": 50, "total": 50,
        }, {
            "brake_too_early": False, "brake_too_late_or_lockup": False,
            "throttle_choppy": False, "throttle_too_early_full": False,
            "missed_apex": False, "over_slow": False,
        }

    # 提取片段数据
    speed = df[speed_col].iloc[s_idx:e_idx + 1].fillna(0).to_numpy() if speed_col and speed_col in df.columns else np.zeros(n)
    latg = df[latg_col].iloc[s_idx:e_idx + 1].fillna(0).to_numpy() if latg_col and latg_col in df.columns else np.zeros(n)
    long_g = df[long_g_col].iloc[s_idx:e_idx + 1].fillna(0).to_numpy() if long_g_col and long_g_col in df.columns else np.zeros(n)
    steer = df[steer_col].iloc[s_idx:e_idx + 1].fillna(0).to_numpy() if steer_col and steer_col in df.columns else np.zeros(n)
    slip = df[slip_col].iloc[s_idx:e_idx + 1].fillna(0).to_numpy() if slip_col and slip_col in df.columns else np.zeros(n)

    # 弯心位置（速度最低点）
    apex_rel = int(np.argmin(speed))
    entry_end_rel = max(1, int(apex_rel * 0.6))
    exit_start_rel = min(n - 2, int(apex_rel + (n - apex_rel) * 0.4))

    speed_entry = speed[:entry_end_rel]
    speed_apex = speed[entry_end_rel:exit_start_rel + 1]
    speed_exit = speed[exit_start_rel:]

    long_g_entry = long_g[:entry_end_rel]
    long_g_exit = long_g[exit_start_rel:]
    steer_exit = steer[exit_start_rel:]
    slip_exit = slip[exit_start_rel:]

    # ---------- 1. 刹车技术评分 ----------
    braking_score = 70.0
    brake_too_early = False
    brake_too_late = False

    if len(long_g_entry) > 0:
        max_brake = np.abs(long_g_entry.clip(max=0)).max()
        # 理想：入弯有持续且平滑的刹车，然后逐渐释放（Trail-braking）
        if max_brake > 0.15:
            braking_score += 10.0
            # 检查刹车是否过早结束（Trail-braking 不足）
            brake_end_idx = np.where(long_g_entry < -0.05)[0]
            if len(brake_end_idx) > 0:
                last_brake = brake_end_idx[-1]
                if last_brake < len(long_g_entry) * 0.20:
                    braking_score -= 20.0
                    brake_too_early = True
                elif last_brake > len(long_g_entry) * 0.98:
                    braking_score -= 15.0
                    brake_too_late = True
        else:
            # 刹车太弱
            braking_score -= 15.0

        # 抱死检测：刹车时滑移率异常高
        if slip_col and len(slip) > 0:
            brake_mask = long_g[:entry_end_rel] < -0.1
            if brake_mask.any():
                avg_slip_under_brake = slip[:entry_end_rel][brake_mask].mean()
                if avg_slip_under_brake > 15.0:
                    braking_score -= 20.0
                    brake_too_late = True  # 抱死视为刹车过晚/过猛
    else:
        braking_score = 50.0

    braking_score = float(np.clip(braking_score, 0, 100))

    # ---------- 2. 弯心速度评分 ----------
    mid_speed_score = 70.0
    over_slow = False

    if len(speed_apex) > 0:
        min_speed = float(speed_apex.min())
        # 与入弯速度对比
        if len(speed_entry) > 0:
            entry_speed = float(speed_entry.mean())
            speed_drop_ratio = (entry_speed - min_speed) / (entry_speed + 1e-3)
            # 理想：速度下降 15%-40%
            if 0.15 <= speed_drop_ratio <= 0.40:
                mid_speed_score += 20.0
            elif speed_drop_ratio > 0.55:
                mid_speed_score -= 35.0
                over_slow = True
            elif speed_drop_ratio < 0.05:
                mid_speed_score -= 10.0  # 几乎没减速，可能错过了刹车点
    else:
        mid_speed_score = 50.0

    mid_speed_score = float(np.clip(mid_speed_score, 0, 100))

    # ---------- 3. 油门控制评分 ----------
    throttle_score = 70.0
    throttle_choppy = False
    throttle_too_early = False

    if len(long_g_exit) > 0:
        # 理想：出弯时纵向 G 平滑上升
        accel = long_g_exit.clip(min=0)
        if accel.max() > 0.2:
            throttle_score += 10.0
            # 检查是否断断续续（方差大）
            if len(accel) > 2:
                accel_std = accel.std()
                if accel_std > 0.15:
                    throttle_score -= 25.0
                    throttle_choppy = True

            # 过早全油门导致打滑
            if slip_col and len(slip_exit) > 0:
                early_exit = slip_exit[:max(1, len(slip_exit) // 2)]
                if early_exit.mean() > 10.0:
                    throttle_score -= 20.0
                    throttle_too_early = True

            # 如果出弯开始就有很大油门且侧向 G 也很高 -> 可能 understeer
            if len(latg) > exit_start_rel:
                early_latg = latg[exit_start_rel:exit_start_rel + max(1, len(latg[exit_start_rel:]) // 2)]
                if early_latg.mean() > 0.85 and accel[:len(early_latg)].mean() > 0.3:
                    throttle_score -= 10.0
        else:
            throttle_score -= 15.0  # 出弯不敢给油
    else:
        throttle_score = 50.0

    throttle_score = float(np.clip(throttle_score, 0, 100))

    # ---------- 4. 走线精准度评分 ----------
    racing_line_score = 70.0
    missed_apex = False

    # 走线精准度综合了转向平滑度和弯心位置
    if len(steer) > 0:
        steer_smoothness = 1.0 / (1.0 + steer.std() * 0.1)
        racing_line_score += (steer_smoothness - 0.5) * 50.0

    # 弯心速度是否是最低点（判断有没有错过弯心）
    if len(speed) > 0:
        global_min_idx = int(np.argmin(speed))
        apex_start = entry_end_rel
        apex_end = exit_start_rel
        if not (apex_start <= global_min_idx <= apex_end):
            racing_line_score -= 30.0
            missed_apex = True

    # 侧向 G 的利用率：理想情况下应接近但不超过轮胎极限 (约 1.0-2.0g)
    if len(latg) > 0:
        max_lat = float(np.abs(latg).max())
        if max_lat < 0.15:
            racing_line_score -= 15.0  # 完全没有利用轮胎
        elif max_lat > 2.5:
            racing_line_score -= 20.0  # 可能超出极限
        else:
            racing_line_score += 10.0

    racing_line_score = float(np.clip(racing_line_score, 0, 100))

    # ---------- 加权总分 ----------
    total = round(
        braking_score * 0.25
        + mid_speed_score * 0.25
        + throttle_score * 0.25
        + racing_line_score * 0.25,
        1,
    )

    scores = {
        "braking": round(braking_score, 1),
        "mid_speed": round(mid_speed_score, 1),
        "throttle": round(throttle_score, 1),
        "racing_line": round(racing_line_score, 1),
        "total": total,
    }

    flags = {
        "brake_too_early": bool(brake_too_early),
        "brake_too_late_or_lockup": bool(brake_too_late),
        "throttle_choppy": bool(throttle_choppy),
        "throttle_too_early_full": bool(throttle_too_early),
        "missed_apex": bool(missed_apex),
        "over_slow": bool(over_slow),
    }

    return scores, flags
