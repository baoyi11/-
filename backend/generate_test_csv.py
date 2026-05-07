"""
generate_test_csv.py —— 生成覆盖全评分场景的测试遥测数据

此脚本生成一个精心构造的 CSV 文件，包含 10 个特征弯道，
每个弯道都设计为触发特定的评分维度和 AI 分类。
"""

import numpy as np
import pandas as pd


np.random.seed(42)
SAMPLE_RATE = 50.0  # Hz
DT = 1.0 / SAMPLE_RATE


def build_corner(
    n_frames: int,
    entry_speed: float,
    apex_speed_min: float,
    exit_speed_max: float,
    brake_start_rel: float,
    brake_end_rel: float,
    throttle_pattern: str,
    max_lat_g: float,
    steer_pattern: str,
    oversteer: bool = False,
    missed_apex: bool = False,
    over_slow: bool = False,
    high_slip: bool = False,
    steering_sign: int = 1,
    steer_noise: float = 0.0,
):
    """
    构造单个弯道的完整时序数据

    Parameters
    ----------
    n_frames : int
        弯道总帧数 (50Hz)
    entry_speed, apex_speed_min, exit_speed_max : float
        入弯/弯心/出弯的目标速度 (km/h)
    brake_start_rel, brake_end_rel : float
        刹车起始/结束相对位置 (0~1, 在整个弯道内的比例)
    throttle_pattern : str
        'smooth' | 'choppy' | 'early_full' | 'hesitant'
    max_lat_g : float
        最大侧向 G 值
    steer_pattern : str
        'smooth' | 'aggressive'
    oversteer : bool
        是否模拟转向过度 (steer 与 yaw 反向)
    missed_apex : bool
        是否模拟错过弯心 (速度最低点不在 apex 区间)
    over_slow : bool
        是否模拟过度减速
    high_slip : bool
        是否模拟高滑移率 (用于触发抱死检测)
    steering_sign : int
        转向方向 (+1 左转, -1 右转)
    """
    # 三阶段分割 (与 evaluator.py 逻辑一致)
    # evaluator 用 apex_rel = argmin(speed) 作为弯心
    # entry_end_rel = max(1, int(apex_rel * 0.6))
    # exit_start_rel = min(n-2, int(apex_rel + (n - apex_rel) * 0.4))
    #
    # 我们先构造 speed 曲线，确保 apex_rel 在预期位置
    speed = np.zeros(n_frames)
    brake = np.zeros(n_frames)
    throttle = np.zeros(n_frames)
    lat_g = np.zeros(n_frames)
    long_g = np.zeros(n_frames)
    yaw_rate = np.zeros(n_frames)
    steering_angle = np.zeros(n_frames)
    slip_ratio = np.zeros(n_frames)
    gear = np.full(n_frames, 4, dtype=int)
    rpm = np.full(n_frames, 6000, dtype=float)

    # ---- speed 曲线 ----
    # 用三次样条构造：entry -> apex -> exit
    apex_idx = int(n_frames * 0.50)

    if over_slow:
        # 过度减速：apex 速度极低
        apex_speed = entry_speed * 0.05
    else:
        apex_speed = apex_speed_min

    if missed_apex:
        # 速度最低点在 entry 阶段 (模拟错过弯心)
        fake_apex = int(n_frames * 0.15)
        entry_idx = np.arange(fake_apex + 1)
        t = entry_idx / max(fake_apex, 1)
        speed[:fake_apex + 1] = entry_speed - (entry_speed - apex_speed * 0.5) * t
        remaining = n_frames - fake_apex
        speed[fake_apex:] = apex_speed * 0.5 + (exit_speed_max - apex_speed * 0.5) * np.linspace(0, 1, remaining)
    else:
        # entry 段: 0 -> apex_idx, speed 从 entry_speed 下降到 apex_speed
        entry_idx = np.arange(apex_idx + 1)
        t_entry = entry_idx / max(apex_idx, 1)
        speed[:apex_idx + 1] = entry_speed - (entry_speed - apex_speed) * (
            3 * t_entry**2 - 2 * t_entry**3
        )

        # exit 段: apex_idx -> end, speed 从 apex_speed 上升到 exit_speed_max
        exit_len = n_frames - apex_idx
        exit_idx = np.arange(exit_len)
        t_exit = exit_idx / max(exit_len, 1)
        speed[apex_idx:] = apex_speed + (exit_speed_max - apex_speed) * (
            3 * t_exit**2 - 2 * t_exit**3
        )

    # ---- brake ----
    b_start = int(n_frames * brake_start_rel)
    b_end = int(n_frames * brake_end_rel)
    if b_end > b_start:
        brake[b_start:b_end] = np.linspace(0.3, 0.9, b_end - b_start)
        # 对应 long_g 为负 (刹车减速)
        long_g[b_start:b_end] = -np.linspace(0.1, 0.8, b_end - b_start)

    # ---- throttle / long_g (exit 阶段) ----
    if throttle_pattern == "smooth":
        # 线性、平滑上升
        exit_frames = n_frames - apex_idx
        t = np.linspace(0, 1, exit_frames)
        throttle[apex_idx:] = 0.3 + 0.7 * (3 * t**2 - 2 * t**3)
        long_g[apex_idx:] = np.clip(
            np.linspace(0.05, 0.50, exit_frames) + np.random.normal(0, 0.02, exit_frames),
            -0.2, 0.8
        )
    elif throttle_pattern == "choppy":
        # 断断续续
        exit_frames = n_frames - apex_idx
        base = np.linspace(0.2, 1.0, exit_frames)
        noise = np.sin(np.linspace(0, 8 * np.pi, exit_frames)) * 0.25
        throttle[apex_idx:] = np.clip(base + noise, 0, 1)
        # 让 long_g 大幅波动以触发 throttle_choppy
        lg = np.linspace(0.0, 0.6, exit_frames)
        for i in range(0, exit_frames, 8):
            lg[i:i+4] += 0.3
            lg[i+4:i+8] -= 0.2
        long_g[apex_idx:] = np.clip(lg + np.random.normal(0, 0.05, exit_frames), -0.2, 0.8)
    elif throttle_pattern == "early_full":
        # 过早全油门
        exit_frames = n_frames - apex_idx
        throttle[apex_idx:] = np.clip(np.linspace(0.8, 1.0, exit_frames), 0, 1)
        long_g[apex_idx:] = np.clip(
            np.linspace(0.3, 0.7, exit_frames) + np.random.normal(0, 0.02, exit_frames),
            -0.2, 0.8
        )
    elif throttle_pattern == "hesitant":
        # 不敢给油
        exit_frames = n_frames - apex_idx
        throttle[apex_idx:] = np.linspace(0.1, 0.4, exit_frames)
        long_g[apex_idx:] = np.clip(
            np.linspace(0.0, 0.15, exit_frames) + np.random.normal(0, 0.01, exit_frames),
            -0.2, 0.8
        )

    # ---- lateral_g ----
    # 在 apex 附近达到最大值
    lat_g = max_lat_g * np.exp(-0.5 * ((np.arange(n_frames) - apex_idx) / (n_frames * 0.20)) ** 2)
    lat_g *= steering_sign

    # ---- steering ----
    if steer_pattern == "smooth":
        steer_max = 0.40
        steering_angle = steer_max * steering_sign * np.exp(
            -0.5 * ((np.arange(n_frames) - apex_idx) / (n_frames * 0.22)) ** 2
        )
    elif steer_pattern == "aggressive":
        steer_max = 0.75
        steering_angle = steer_max * steering_sign * np.exp(
            -0.5 * ((np.arange(n_frames) - apex_idx) / (n_frames * 0.18)) ** 2
        )

    if steer_noise > 0:
        steering_angle += np.random.normal(0, steer_noise, n_frames)
        steering_angle = np.clip(steering_angle, -1.0, 1.0)

    # ---- yaw_rate ----
    # 正常情况下 yaw_rate 与 steering 同向，比例合理
    # Understeer: yaw_rate < steering * expected_ratio
    # Oversteer: yaw_rate 与 steering 反向
    if oversteer:
        yaw_rate = -0.8 * steering_angle  # 反打方向救车
    else:
        yaw_rate = 0.6 * steering_angle  # 正常响应

    # ---- slip_ratio ----
    # 基础滑移 + 刹车阶段的高滑移
    slip_base = np.abs(lat_g) + np.abs(steering_angle) * 0.5
    slip_brake = brake * (8.0 if high_slip else 1.5)
    slip_ratio = slip_base + slip_brake
    if high_slip:
        slip_ratio += 15.0  # 直接触发抱死检测阈值

    # ---- gear / rpm ----
    gear = np.where(speed < 40, 2, np.where(speed < 70, 3, 4))
    rpm = 3000 + speed * 40 + np.random.normal(0, 100, n_frames)

    return {
        "speed": speed,
        "brake": brake,
        "throttle": throttle,
        "lat_g": lat_g,
        "long_g": long_g,
        "yaw_rate": yaw_rate,
        "steering_angle": steering_angle,
        "slip_ratio": slip_ratio,
        "gear": gear,
        "rpm": rpm,
    }


def build_straight(n_frames: int, speed: float):
    """构造直道数据"""
    return {
        "speed": np.full(n_frames, speed) + np.random.normal(0, 1.0, n_frames),
        "brake": np.zeros(n_frames),
        "throttle": np.full(n_frames, 0.85) + np.random.normal(0, 0.02, n_frames),
        "lat_g": np.zeros(n_frames),
        "long_g": np.zeros(n_frames) + np.random.normal(0, 0.01, n_frames),
        "yaw_rate": np.zeros(n_frames) + np.random.normal(0, 0.005, n_frames),
        "steering_angle": np.zeros(n_frames) + np.random.normal(0, 0.01, n_frames),
        "slip_ratio": np.zeros(n_frames) + np.random.normal(0, 0.05, n_frames),
        "gear": np.full(n_frames, 5, dtype=int),
        "rpm": np.full(n_frames, 7000) + np.random.normal(0, 100, n_frames),
    }


def generate_test_csv(path: str):
    # ========== 10 个精心设计的弯道 ==========
    corners_config = [
        # 1. Alien 级 —— 完美
        {
            "n_frames": 180,
            "entry_speed": 120.0,
            "apex_speed_min": 65.0,
            "exit_speed_max": 115.0,
            "brake_start_rel": 0.15,
            "brake_end_rel": 0.55,
            "throttle_pattern": "smooth",
            "max_lat_g": 1.3,
            "steer_pattern": "smooth",
            "steering_sign": 1,
            "oversteer": False,
            "missed_apex": False,
            "over_slow": False,
            "high_slip": False,
        },
        # 2. Takumi 级 —— 接近完美，但油门稍犹豫
        {
            "n_frames": 170,
            "entry_speed": 110.0,
            "apex_speed_min": 60.0,
            "exit_speed_max": 105.0,
            "brake_start_rel": 0.18,
            "brake_end_rel": 0.50,
            "throttle_pattern": "hesitant",
            "max_lat_g": 1.2,
            "steer_pattern": "smooth",
            "steering_sign": -1,
            "oversteer": False,
            "missed_apex": False,
            "over_slow": False,
            "high_slip": False,
        },
        # 3. Trackday Warrior —— 刹车稍早，走线尚可
        {
            "n_frames": 160,
            "entry_speed": 100.0,
            "apex_speed_min": 55.0,
            "exit_speed_max": 95.0,
            "brake_start_rel": 0.08,
            "brake_end_rel": 0.30,
            "throttle_pattern": "smooth",
            "max_lat_g": 1.1,
            "steer_pattern": "smooth",
            "steering_sign": 1,
            "oversteer": False,
            "missed_apex": False,
            "over_slow": False,
            "high_slip": False,
        },
        # 4. 刹车过早
        {
            "n_frames": 160,
            "entry_speed": 105.0,
            "apex_speed_min": 55.0,
            "exit_speed_max": 95.0,
            "brake_start_rel": 0.05,
            "brake_end_rel": 0.22,
            "throttle_pattern": "smooth",
            "max_lat_g": 1.0,
            "steer_pattern": "smooth",
            "steering_sign": -1,
            "oversteer": False,
            "missed_apex": False,
            "over_slow": False,
            "high_slip": False,
        },
        # 5. 刹车过晚 / 抱死 (Dynamic Hazard)
        {
            "n_frames": 180,
            "entry_speed": 115.0,
            "apex_speed_min": 55.0,
            "exit_speed_max": 100.0,
            "brake_start_rel": 0.35,
            "brake_end_rel": 0.70,
            "throttle_pattern": "smooth",
            "max_lat_g": 0.25,
            "steer_pattern": "aggressive",
            "steering_sign": 1,
            "oversteer": False,
            "missed_apex": False,
            "over_slow": False,
            "high_slip": True,
        },
        # 6. 油门断续
        {
            "n_frames": 170,
            "entry_speed": 100.0,
            "apex_speed_min": 55.0,
            "exit_speed_max": 90.0,
            "brake_start_rel": 0.15,
            "brake_end_rel": 0.50,
            "throttle_pattern": "choppy",
            "max_lat_g": 1.0,
            "steer_pattern": "smooth",
            "steering_sign": -1,
            "oversteer": False,
            "missed_apex": False,
            "over_slow": False,
            "high_slip": False,
        },
        # 7. 过早全油门
        {
            "n_frames": 160,
            "entry_speed": 95.0,
            "apex_speed_min": 50.0,
            "exit_speed_max": 88.0,
            "brake_start_rel": 0.15,
            "brake_end_rel": 0.48,
            "throttle_pattern": "early_full",
            "max_lat_g": 0.9,
            "steer_pattern": "smooth",
            "steering_sign": 1,
            "oversteer": False,
            "missed_apex": False,
            "over_slow": False,
            "high_slip": False,
        },
        # 8. 错过弯心
        {
            "n_frames": 170,
            "entry_speed": 100.0,
            "apex_speed_min": 52.0,
            "exit_speed_max": 92.0,
            "brake_start_rel": 0.12,
            "brake_end_rel": 0.48,
            "throttle_pattern": "smooth",
            "max_lat_g": 1.0,
            "steer_pattern": "smooth",
            "steering_sign": -1,
            "oversteer": False,
            "missed_apex": True,
            "over_slow": False,
            "high_slip": False,
        },
        # 9. 过度减速
        {
            "n_frames": 160,
            "entry_speed": 100.0,
            "apex_speed_min": 25.0,
            "exit_speed_max": 85.0,
            "brake_start_rel": 0.10,
            "brake_end_rel": 0.55,
            "throttle_pattern": "smooth",
            "max_lat_g": 0.8,
            "steer_pattern": "smooth",
            "steering_sign": 1,
            "oversteer": False,
            "missed_apex": False,
            "over_slow": True,
            "high_slip": False,
        },
        # 10. Mobile Chicane —— 全面崩溃
        {
            "n_frames": 170,
            "entry_speed": 90.0,
            "apex_speed_min": 0.0,
            "exit_speed_max": 25.0,
            "brake_start_rel": 0.05,
            "brake_end_rel": 0.08,
            "throttle_pattern": "hesitant",
            "max_lat_g": 0.25,
            "steer_pattern": "aggressive",
            "steering_sign": -1,
            "oversteer": False,
            "missed_apex": False,
            "over_slow": True,
            "high_slip": False,
            "steer_noise": 0.8,
        },
        # 11. Oversteer —— 反打方向救车
        {
            "n_frames": 170,
            "entry_speed": 105.0,
            "apex_speed_min": 50.0,
            "exit_speed_max": 95.0,
            "brake_start_rel": 0.15,
            "brake_end_rel": 0.50,
            "throttle_pattern": "smooth",
            "max_lat_g": 1.2,
            "steer_pattern": "aggressive",
            "steering_sign": 1,
            "oversteer": True,
            "missed_apex": False,
            "over_slow": False,
            "high_slip": False,
        },
    ]

    all_data = []
    current_time = 0.0
    pos_x, pos_y = 0.0, 0.0
    heading = 0.0

    # 初始直道 (起跑)
    straight = build_straight(150, 80.0)
    for i in range(150):
        all_data.append({
            "time": round(current_time, 3),
            "speed": round(straight["speed"][i], 2),
            "lat_g": round(straight["lat_g"][i], 3),
            "long_g": round(straight["long_g"][i], 3),
            "yaw_rate": round(straight["yaw_rate"][i], 4),
            "steering_angle": round(straight["steering_angle"][i], 3),
            "throttle": round(np.clip(straight["throttle"][i], 0, 1), 2),
            "brake": round(straight["brake"][i], 2),
            "slip_ratio": round(straight["slip_ratio"][i], 2),
            "gear": int(straight["gear"][i]),
            "rpm": round(straight["rpm"][i], 0),
            "pos_x": round(pos_x, 2),
            "pos_y": round(pos_y, 2),
        })
        speed_ms = straight["speed"][i] / 3.6
        pos_x += speed_ms * np.cos(heading) * DT
        pos_y += speed_ms * np.sin(heading) * DT
        current_time += DT

    for idx, cfg in enumerate(corners_config):
        # 直道 (最后一个弯道前用更长的直道，确保 segment 不提前截取)
        straight_len = 300 if idx == len(corners_config) - 1 else 180
        straight = build_straight(straight_len, cfg["entry_speed"])
        for i in range(180):
            all_data.append({
                "time": round(current_time, 3),
                "speed": round(straight["speed"][i], 2),
                "lat_g": round(straight["lat_g"][i], 3),
                "long_g": round(straight["long_g"][i], 3),
                "yaw_rate": round(straight["yaw_rate"][i], 4),
                "steering_angle": round(straight["steering_angle"][i], 3),
                "throttle": round(np.clip(straight["throttle"][i], 0, 1), 2),
                "brake": round(straight["brake"][i], 2),
                "slip_ratio": round(straight["slip_ratio"][i], 2),
                "gear": int(straight["gear"][i]),
                "rpm": round(straight["rpm"][i], 0),
                "pos_x": round(pos_x, 2),
                "pos_y": round(pos_y, 2),
            })
            speed_ms = straight["speed"][i] / 3.6
            pos_x += speed_ms * np.cos(heading) * DT
            pos_y += speed_ms * np.sin(heading) * DT
            current_time += DT

        # 弯道
        corner = build_corner(**cfg)
        n_frames = cfg["n_frames"]
        for i in range(n_frames):
            all_data.append({
                "time": round(current_time, 3),
                "speed": round(corner["speed"][i], 2),
                "lat_g": round(corner["lat_g"][i], 3),
                "long_g": round(corner["long_g"][i], 3),
                "yaw_rate": round(corner["yaw_rate"][i], 4),
                "steering_angle": round(corner["steering_angle"][i], 3),
                "throttle": round(np.clip(corner["throttle"][i], 0, 1), 2),
                "brake": round(corner["brake"][i], 2),
                "slip_ratio": round(corner["slip_ratio"][i], 2),
                "gear": int(corner["gear"][i]),
                "rpm": round(corner["rpm"][i], 0),
                "pos_x": round(pos_x, 2),
                "pos_y": round(pos_y, 2),
            })
            speed_ms = corner["speed"][i] / 3.6
            heading += corner["yaw_rate"][i] * DT
            pos_x += speed_ms * np.cos(heading) * DT
            pos_y += speed_ms * np.sin(heading) * DT
            current_time += DT

    # 最终直道
    straight = build_straight(200, 90.0)
    for i in range(200):
        all_data.append({
            "time": round(current_time, 3),
            "speed": round(straight["speed"][i], 2),
            "lat_g": round(straight["lat_g"][i], 3),
            "long_g": round(straight["long_g"][i], 3),
            "yaw_rate": round(straight["yaw_rate"][i], 4),
            "steering_angle": round(straight["steering_angle"][i], 3),
            "throttle": round(np.clip(straight["throttle"][i], 0, 1), 2),
            "brake": round(straight["brake"][i], 2),
            "slip_ratio": round(straight["slip_ratio"][i], 2),
            "gear": int(straight["gear"][i]),
            "rpm": round(straight["rpm"][i], 0),
            "pos_x": round(pos_x, 2),
            "pos_y": round(pos_y, 2),
        })
        speed_ms = straight["speed"][i] / 3.6
        pos_x += speed_ms * np.cos(heading) * DT
        pos_y += speed_ms * np.sin(heading) * DT
        current_time += DT

    df = pd.DataFrame(all_data)
    df.to_csv(path, index=False)
    print(f"Generated test CSV: {path}")
    print(f"  Total rows: {len(df)}")
    print(f"  Duration: {df['time'].iloc[-1]:.1f}s")
    print(f"  Corners: {len(corners_config)}")


if __name__ == "__main__":
    generate_test_csv("/workspace/projects/public/test_telemetry.csv")
