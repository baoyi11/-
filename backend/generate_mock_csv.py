"""
generate_mock_csv.py
生成测试用的模拟遥测 CSV 文件
"""

import sys, os
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

import numpy as np
import pandas as pd


def generate_track_csv(n_corners: int = 6, output_path: str = "mock_telemetry.csv"):
    """生成包含多个弯道的完整遥测 CSV"""
    np.random.seed(42)
    all_data = []
    t_offset = 0.0
    x_offset = 0.0
    y_offset = 0.0

    for i in range(n_corners):
        # 直道
        straight_len = np.random.randint(80, 150)
        straight = {
            "time": np.arange(straight_len) * 0.05 + t_offset,
            "x": np.zeros(straight_len),
            "y": np.zeros(straight_len),
            "speed": np.ones(straight_len) * 120 + np.random.randn(straight_len) * 2,
            "yaw_rate": np.zeros(straight_len),
            "lat_g": np.zeros(straight_len),
            "long_g": np.zeros(straight_len),
            "steering_angle": np.zeros(straight_len),
            "slip_ratio": np.ones(straight_len) * 2.0,
        }
        for j in range(1, straight_len):
            straight["x"][j] = straight["x"][j-1] + 2.0
            straight["y"][j] = straight["y"][j-1] + np.random.randn() * 0.2
        t_offset += straight_len * 0.05
        x_offset = straight["x"][-1]
        y_offset = straight["y"][-1]
        all_data.append(pd.DataFrame(straight))

        # 弯道
        corner_len = 128
        angle = np.linspace(0, np.pi * 0.6, corner_len)
        radius = 30.0 + np.random.randn() * 5
        turn_dir = 1 if i % 2 == 0 else -1

        # 模拟弯道动力学特征
        speed = 120 * (0.6 + 0.25 * np.cos(np.pi * (np.arange(corner_len) - corner_len*0.5) / (corner_len*0.8)))
        lat_g = turn_dir * (1.0 * np.sin(np.pi * np.arange(corner_len) / corner_len) + np.random.randn(corner_len) * 0.05)
        long_g = np.zeros(corner_len)
        brake_end = int(corner_len * 0.35)
        accel_start = int(corner_len * 0.65)
        long_g[:brake_end] = -0.8 * (1.0 - np.arange(brake_end) / brake_end)
        long_g[accel_start:] = 0.6 * ((np.arange(corner_len - accel_start)) / (corner_len - accel_start))
        yaw_rate = lat_g * speed / 100.0 + np.random.randn(corner_len) * 0.02
        steer = np.arctan(yaw_rate * 2.5 + 0.1) * 180 / np.pi * turn_dir + np.random.randn(corner_len) * 1.5
        slip = 3.0 + np.abs(lat_g) * 3.0 + np.random.randn(corner_len) * 0.5

        # 随机加入失误特征
        if i == 1:  # understeer-like
            speed[accel_start:] *= 0.92
            slip[accel_start:] += 8
            steer *= 1.3
            yaw_rate *= 0.7
        elif i == 2:  # oversteer-like
            long_g[:int(corner_len*0.2)] = 0.0
            long_g[int(corner_len*0.2):int(corner_len*0.4)] = -1.2
            steer[int(corner_len*0.25):int(corner_len*0.30)] += 40
            slip[accel_start:] += 12

        corner = {
            "time": np.arange(corner_len) * 0.05 + t_offset,
            "x": x_offset + radius * np.sin(angle) * turn_dir,
            "y": y_offset + radius * (1 - np.cos(angle)),
            "speed": speed,
            "yaw_rate": yaw_rate,
            "lat_g": lat_g,
            "long_g": long_g,
            "steering_angle": steer,
            "slip_ratio": slip,
        }
        t_offset += corner_len * 0.05
        all_data.append(pd.DataFrame(corner))

    df = pd.concat(all_data, ignore_index=True)
    df["time"] = np.arange(len(df)) * 0.05
    df["distance"] = 0.0
    for i in range(1, len(df)):
        dx = df["x"].iloc[i] - df["x"].iloc[i-1]
        dy = df["y"].iloc[i] - df["y"].iloc[i-1]
        df.loc[i, "distance"] = df["distance"].iloc[i-1] + np.hypot(dx, dy)

    df.to_csv(output_path, index=False)
    print(f"Generated mock telemetry: {output_path} ({len(df)} rows, {n_corners} corners)")
    return output_path


if __name__ == "__main__":
    generate_track_csv(n_corners=6, output_path="mock_telemetry.csv")
