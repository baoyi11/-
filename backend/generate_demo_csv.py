"""
生成高质量、大容量的演示遥测 CSV 文件。
覆盖多种弯道类型与驾驶特征，用于全面测试系统功能。
"""

import math
import random
import numpy as np
import pandas as pd

random.seed(42)
np.random.seed(42)

# =============================================================================
# 赛道几何定义：一段约 4.2km 的虚构赛道，包含 16 个弯道
# =============================================================================

TRACK_SEGMENTS = [
    # (类型, 长度米, 半径米, 方向:1=左/-1=右, 特征标签)
    ("straight", 420, None, 0, "launch"),
    ("corner", 180, 45, 1, "understeer_heavy"),   # 1 号弯：U型左弯，转向不足
    ("straight", 260, None, 0, "short_straight"),
    ("corner", 150, 60, -1, "perfect"),            # 2 号弯：完美右弯
    ("straight", 500, None, 0, "long_straight"),
    ("corner", 200, 55, 1, "brake_early"),         # 3 号弯：刹车过早
    ("straight", 180, None, 0, "short_chute"),     # ← 插入短直道，避免与4号弯合并
    ("corner", 140, 40, -1, "oversteer_exit"),     # 4 号弯：出弯甩尾
    ("straight", 320, None, 0, "medium_straight"),
    ("corner", 220, 80, 1, "perfect"),             # 5 号弯：高速左弯，完美
    ("straight", 150, None, 0, "short_chute"),     # ← 插入短直道，避免与6号弯合并
    ("corner", 120, 35, -1, "brake_late"),         # 6 号弯：刹车过晚
    ("straight", 280, None, 0, "short_straight"),
    ("corner", 170, 50, 1, "missed_apex"),         # 7 号弯：错过弯心
    ("straight", 120, None, 0, "short_chute"),     # ← 插入短直道，避免与8号弯合并
    ("corner", 130, 42, -1, "over_slow"),          # 8 号弯：过度减速
    ("straight", 600, None, 0, "back_straight"),
    ("corner", 190, 70, 1, "perfect"),             # 9 号弯：完美
    ("straight", 200, None, 0, "short_straight"),
    ("corner", 160, 48, -1, "throttle_choppy"),    # 10 号弯：油门断续
    ("straight", 100, None, 0, "short_chute"),     # ← 插入短直道，避免与11号弯合并
    ("corner", 110, 32, 1, "oversteer_exit"),      # 11 号弯：出弯甩尾
    ("straight", 350, None, 0, "medium_straight"),
    ("corner", 210, 65, -1, "perfect"),            # 12 号弯：高速右弯
    ("straight", 240, None, 0, "short_straight"),
    ("corner", 140, 38, 1, "understeer_light"),    # 13 号弯：轻微推头
    ("straight", 130, None, 0, "short_chute"),     # ← 插入短直道，避免与14号弯合并
    ("corner", 180, 52, -1, "brake_early"),        # 14 号弯：刹车过早
    ("straight", 380, None, 0, "medium_straight"),
    ("corner", 200, 58, 1, "missed_apex"),         # 15 号弯：错过弯心
    ("straight", 110, None, 0, "short_chute"),     # ← 插入短直道，避免与16号弯合并
    ("corner", 150, 44, -1, "perfect"),            # 16 号弯：完美收尾
    ("straight", 300, None, 0, "pit_straight"),
]

SAMPLING_HZ = 50  # 50Hz 高精度采样
DT = 1.0 / SAMPLING_HZ

# =============================================================================
# 特征参数映射：根据标签定义过弯风格
# =============================================================================

FEATURE_PROFILES = {
    "perfect": {
        "entry_speed_ratio": 0.92,
        "brake_point_ratio": 0.30,
        "trail_brake": True,
        "apex_speed_ratio": 0.78,
        "throttle_ramp": 0.55,
        "exit_speed_ratio": 0.95,
        "steering_smoothness": 0.98,
        "line_accuracy": 0.95,
    },
    "understeer_heavy": {
        "entry_speed_ratio": 1.08,
        "brake_point_ratio": 0.18,
        "trail_brake": False,
        "apex_speed_ratio": 0.65,
        "throttle_ramp": 0.40,
        "exit_speed_ratio": 0.80,
        "steering_smoothness": 0.70,
        "line_accuracy": 0.55,
    },
    "understeer_light": {
        "entry_speed_ratio": 1.02,
        "brake_point_ratio": 0.22,
        "trail_brake": True,
        "apex_speed_ratio": 0.72,
        "throttle_ramp": 0.48,
        "exit_speed_ratio": 0.88,
        "steering_smoothness": 0.82,
        "line_accuracy": 0.72,
    },
    "oversteer_exit": {
        "entry_speed_ratio": 0.95,
        "brake_point_ratio": 0.28,
        "trail_brake": True,
        "apex_speed_ratio": 0.75,
        "throttle_ramp": 0.85,
        "exit_speed_ratio": 0.92,
        "steering_smoothness": 0.75,
        "line_accuracy": 0.70,
    },
    "brake_early": {
        "entry_speed_ratio": 0.85,
        "brake_point_ratio": 0.50,
        "trail_brake": False,
        "apex_speed_ratio": 0.60,
        "throttle_ramp": 0.50,
        "exit_speed_ratio": 0.82,
        "steering_smoothness": 0.90,
        "line_accuracy": 0.80,
    },
    "brake_late": {
        "entry_speed_ratio": 1.05,
        "brake_point_ratio": 0.10,
        "trail_brake": False,
        "apex_speed_ratio": 0.62,
        "throttle_ramp": 0.45,
        "exit_speed_ratio": 0.78,
        "steering_smoothness": 0.65,
        "line_accuracy": 0.50,
    },
    "missed_apex": {
        "entry_speed_ratio": 0.95,
        "brake_point_ratio": 0.28,
        "trail_brake": True,
        "apex_speed_ratio": 0.70,
        "throttle_ramp": 0.52,
        "exit_speed_ratio": 0.88,
        "steering_smoothness": 0.85,
        "line_accuracy": 0.45,
    },
    "over_slow": {
        "entry_speed_ratio": 0.75,
        "brake_point_ratio": 0.40,
        "trail_brake": False,
        "apex_speed_ratio": 0.45,
        "throttle_ramp": 0.35,
        "exit_speed_ratio": 0.70,
        "steering_smoothness": 0.92,
        "line_accuracy": 0.75,
    },
    "throttle_choppy": {
        "entry_speed_ratio": 0.93,
        "brake_point_ratio": 0.30,
        "trail_brake": True,
        "apex_speed_ratio": 0.76,
        "throttle_ramp": 0.30,
        "exit_speed_ratio": 0.85,
        "steering_smoothness": 0.88,
        "line_accuracy": 0.82,
    },
}


def straight_profile():
    """直道默认参数"""
    return {
        "entry_speed_ratio": 1.0,
        "brake_point_ratio": 0.0,
        "trail_brake": False,
        "apex_speed_ratio": 1.0,
        "throttle_ramp": 1.0,
        "exit_speed_ratio": 1.0,
        "steering_smoothness": 1.0,
        "line_accuracy": 1.0,
    }


# =============================================================================
# 物理常量与辅助函数
# =============================================================================

G = 9.80665
MAX_SPEED = 320  # km/h，直道尾速
MIN_CORNER_SPEED_BASE = 45  # 最慢弯基础速度


def speed_for_radius(radius: float) -> float:
    """根据弯道半径估算理论最高速度 (km/h)，基于摩擦圆极限"""
    # mu * g = v^2 / r  -> v = sqrt(mu * g * r)
    # 假设 mu = 1.65 (高性能赛车胎)
    mu = 1.65
    v_ms = math.sqrt(mu * G * radius)
    return v_ms * 3.6


def lowpass_filter(signal: np.ndarray, alpha: float = 0.15) -> np.ndarray:
    """一阶低通滤波，模拟传感器平滑特性"""
    out = np.zeros_like(signal)
    out[0] = signal[0]
    for i in range(1, len(signal)):
        out[i] = alpha * signal[i] + (1 - alpha) * out[i - 1]
    return out


def add_sensor_noise(signal: np.ndarray, scale: float = 0.02) -> np.ndarray:
    """添加高斯传感器噪声"""
    noise = np.random.normal(0, scale * np.std(signal), size=signal.shape)
    return signal + noise


# =============================================================================
# 核心生成逻辑
# =============================================================================

def generate_segment_data(
    seg_type: str,
    length_m: float,
    radius_m: float | None,
    direction: int,
    feature_tag: str,
    start_speed: float,
    start_x: float,
    start_y: float,
    start_heading: float,
) -> tuple[pd.DataFrame, float, float, float, float]:
    """
    生成单个赛段（直道或弯道）的遥测数据。
    返回: DataFrame, 末速度, 末X, 末Y, 末航向角
    """
    n_samples = max(20, int(length_m / (start_speed / 3.6 * DT)))
    n_samples = min(n_samples, 2000)

    if seg_type == "straight":
        profile = straight_profile()
        target_speed = MAX_SPEED
        # 直道：加速到尾速或保持
        speeds = np.linspace(start_speed, target_speed, n_samples)
        speeds = np.clip(speeds, 30, MAX_SPEED)
        # 轻微波动
        speeds += np.random.normal(0, 1.5, n_samples)
        speeds = np.clip(speeds, 30, MAX_SPEED)

        steering = np.random.normal(0, 0.5, n_samples)
        yaw_rate = np.random.normal(0, 1.0, n_samples)
        lat_g = np.random.normal(0, 0.05, n_samples)
        long_g = np.where(np.diff(speeds, prepend=speeds[0]) > 0, 0.25, -0.05)
        long_g += np.random.normal(0, 0.03, n_samples)
        slip_ratio = np.random.normal(0, 0.3, n_samples)

        # 坐标：沿 heading 前进
        ds = speeds / 3.6 * DT
        xs = start_x + np.cumsum(ds * np.cos(np.radians(start_heading)))
        ys = start_y + np.cumsum(ds * np.sin(np.radians(start_heading)))

    else:
        # 弯道
        profile = FEATURE_PROFILES.get(feature_tag, FEATURE_PROFILES["perfect"])
        theoretical_max = speed_for_radius(radius_m)
        entry_target = theoretical_max * profile["entry_speed_ratio"]
        apex_target = theoretical_max * profile["apex_speed_ratio"]
        exit_target = theoretical_max * profile["exit_speed_ratio"]

        # 将弯道分为三段：入弯(0-35%) / 弯心(35%-70%) / 出弯(70%-100%)
        n_entry = int(n_samples * 0.35)
        n_apex = int(n_samples * 0.35)
        n_exit = n_samples - n_entry - n_apex

        # --- 速度曲线 ---
        # 避免高速直捣小半径弯：入弯速度不得超过 entry_target 的 1.2 倍
        # 超出部分在入弯前即通过强烈刹车消除
        max_entry = entry_target * 1.20
        actual_start = min(start_speed, max_entry)
        if start_speed > max_entry:
            # 模拟入弯前的猛烈刹车：前几个点快速掉速
            overshoot = start_speed - actual_start
            entry_spd = np.zeros(n_entry)
            for i in range(n_entry):
                t = i / max(1, n_entry - 1)
                # 二次曲线：开头掉速快，后面线性趋近 entry_target
                decel = overshoot * (1 - t) ** 1.5
                entry_spd[i] = actual_start + (entry_target - actual_start) * t - decel * 0.3
        else:
            entry_spd = np.linspace(actual_start, entry_target, n_entry)

        # 刹车点偏移微调
        brake_shift = int(n_entry * (1 - profile["brake_point_ratio"]))
        if brake_shift < n_entry and start_speed <= max_entry:
            decel = np.linspace(0, -0.5, n_entry - brake_shift)
            entry_spd[brake_shift:] += decel * 3.6 * DT * (n_entry - brake_shift)

        apex_spd = np.linspace(entry_spd[-1] if len(entry_spd) else actual_start, apex_target, n_apex)
        exit_spd = np.linspace(apex_spd[-1] if len(apex_spd) else apex_target, exit_target, n_exit)
        # 油门 ramp：如果 throttle_ramp 低（断续），添加波动
        if profile["throttle_ramp"] < 0.5:
            chop = np.sin(np.linspace(0, 6 * np.pi, n_exit)) * 6
            exit_spd += chop
        else:
            ramp_factor = profile["throttle_ramp"]
            exit_spd = np.linspace(apex_spd[-1], exit_target * (0.75 + 0.25 * ramp_factor), n_exit)

        speeds = np.concatenate([entry_spd, apex_spd, exit_spd])
        speeds = np.clip(speeds, 20, MAX_SPEED)
        speeds += np.random.normal(0, 0.8, len(speeds))
        speeds = lowpass_filter(np.clip(speeds, 20, MAX_SPEED), alpha=0.25)

        # --- 转向角 ---
        max_steering = math.degrees(math.atan(2.8 / radius_m)) * 12 * direction  # 简化的阿克曼转向
        steering_entry = np.linspace(0, max_steering * 0.9, n_entry)
        steering_apex = np.linspace(max_steering * 0.9, max_steering, n_apex)
        steering_exit = np.linspace(max_steering, 0, n_exit)
        steering = np.concatenate([steering_entry, steering_apex, steering_exit])

        # 转向不足/过度修正
        if "understeer" in feature_tag:
            steering += np.random.normal(5 * direction, 3, len(steering))
        elif "oversteer" in feature_tag:
            # 出弯阶段反向修正
            correction = np.zeros(len(steering))
            correction[n_entry + n_apex :] = -8 * direction
            steering += correction + np.random.normal(0, 2, len(steering))
        elif "missed_apex" in feature_tag:
            steering += np.random.normal(3 * direction, 2, len(steering))

        # 平滑度噪声
        smooth = profile["steering_smoothness"]
        steering += np.random.normal(0, (1 - smooth) * 4, len(steering))
        steering = lowpass_filter(steering, alpha=0.2 + 0.15 * smooth)

        # --- 横摆角速度 ---
        yaw_rate = (speeds / 3.6) * np.tan(np.radians(steering / 12)) / 2.8
        yaw_rate = np.degrees(yaw_rate)
        yaw_rate = lowpass_filter(yaw_rate, alpha=0.3)
        yaw_rate += np.random.normal(0, 2.0, len(yaw_rate))

        # --- G 值 ---
        lat_g = (speeds / 3.6) ** 2 / (radius_m * G) * direction
        lat_g += np.random.normal(0, 0.08, len(lat_g))
        lat_g = lowpass_filter(lat_g, alpha=0.25)

        long_g = np.zeros(len(speeds))
        dv = np.diff(speeds / 3.6, prepend=speeds[0] / 3.6)
        long_g = dv / DT / G
        long_g = lowpass_filter(long_g, alpha=0.3)
        long_g += np.random.normal(0, 0.06, len(long_g))

        # 刹车过晚导致强烈纵向减速
        if "brake_late" in feature_tag:
            late_idx = int(n_samples * 0.05)
            long_g[late_idx : late_idx + 15] -= 1.2

        # --- 滑移率 ---
        slip_ratio = np.abs(long_g) * 3.5 + np.abs(lat_g) * 2.0
        slip_ratio += np.random.normal(0, 1.5, len(slip_ratio))
        if "oversteer" in feature_tag:
            slip_ratio[n_entry + n_apex :] += 8
        slip_ratio = np.clip(slip_ratio, -2, 35)

        # --- 坐标（圆弧近似） ---
        arc_len = length_m / n_samples
        heading = start_heading + np.cumsum(
            np.full(n_samples, math.degrees(arc_len / radius_m) * direction)
        )
        dx = arc_len * np.cos(np.radians(heading))
        dy = arc_len * np.sin(np.radians(heading))
        xs = start_x + np.cumsum(dx)
        ys = start_y + np.cumsum(dy)

    # 时间
    times = np.arange(n_samples) * DT
    distances = np.cumsum(speeds / 3.6 * DT)

    df = pd.DataFrame({
        "time": times,
        "x": xs,
        "y": ys,
        "speed": np.round(speeds, 2),
        "yaw_rate": np.round(yaw_rate, 2),
        "lat_g": np.round(lat_g, 3),
        "long_g": np.round(long_g, 3),
        "steering_angle": np.round(steering, 2),
        "slip_ratio": np.round(slip_ratio, 2),
        "distance": np.round(distances, 2),
    })

    end_speed = float(speeds[-1])
    end_x = float(xs[-1])
    end_y = float(ys[-1])
    end_heading = float(start_heading + math.degrees(length_m / (radius_m or 9999)) * direction) if seg_type == "corner" else start_heading

    return df, end_speed, end_x, end_y, end_heading


# =============================================================================
# 主生成流程
# =============================================================================

def generate_demo_csv(output_path: str = "demo_telemetry.csv"):
    all_segments = []
    current_speed = 120.0
    current_x, current_y = 0.0, 0.0
    current_heading = 0.0
    global_time_offset = 0.0
    global_distance_offset = 0.0

    seg_id = 0
    for seg_type, length, radius, direction, tag in TRACK_SEGMENTS:
        seg_id += 1
        df, current_speed, current_x, current_y, current_heading = generate_segment_data(
            seg_type, length, radius, direction, tag,
            current_speed, current_x, current_y, current_heading,
        )
        # 时间连续化
        df["time"] += global_time_offset
        df["distance"] += global_distance_offset
        df["segment_id"] = seg_id
        df["segment_type"] = seg_type
        df["feature_tag"] = tag

        global_time_offset = float(df["time"].iloc[-1]) + DT
        global_distance_offset = float(df["distance"].iloc[-1])

        all_segments.append(df)

    full_df = pd.concat(all_segments, ignore_index=True)

    # 轻微漂移修正（让赛道大致闭合）
    full_df["x"] -= np.linspace(0, full_df["x"].iloc[-1] * 0.3, len(full_df))
    full_df["y"] -= np.linspace(0, full_df["y"].iloc[-1] * 0.3, len(full_df))

    # 最终列序
    full_df = full_df[[
        "time", "x", "y", "speed", "yaw_rate",
        "lat_g", "long_g", "steering_angle", "slip_ratio", "distance",
    ]]

    full_df.to_csv(output_path, index=False, float_format="%.3f")
    print(f"✅ 演示遥测文件已生成: {output_path}")
    print(f"   总行数: {len(full_df):,}")
    print(f"   总时长: {full_df['time'].iloc[-1]:.1f}s ({full_df['time'].iloc[-1]/60:.1f}分钟)")
    print(f"   采样率: {SAMPLING_HZ}Hz")
    print(f"   总距离: {full_df['distance'].iloc[-1]:.0f}m")
    print(f"   最大速度: {full_df['speed'].max():.1f} km/h")
    print(f"   最小速度: {full_df['speed'].min():.1f} km/h")
    print(f"   最大侧向G: {full_df['lat_g'].abs().max():.2f} G")
    print(f"   最大纵向G: {full_df['long_g'].abs().max():.2f} G")
    print(f"   弯道数: {sum(1 for s in TRACK_SEGMENTS if s[0] == 'corner')}")
    print(f"   直道数: {sum(1 for s in TRACK_SEGMENTS if s[0] == 'straight')}")
    print(f"   文件大小: {output_path}")


if __name__ == "__main__":
    generate_demo_csv("demo_telemetry.csv")
