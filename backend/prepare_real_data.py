"""
prepare_real_data.py
====================
真实遥测数据预处理脚本。
功能：字段映射 → 特征工程 → 平滑降噪 → 异常值过滤 → 自动标注 → 滑动窗口 → 归一化
"""

from __future__ import annotations

import json
import os
import pickle
from typing import List, Tuple

import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler

# ---------------------------------------------------------------------------
# 1. 配置常量
# ---------------------------------------------------------------------------
RAW_CSV_PATH = os.path.join(os.path.dirname(__file__), "real_telemetry.csv")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "processed")
SEQUENCE_LENGTH = 50
STRIDE = 5
TEST_SPLIT = 0.15
RANDOM_SEED = 42

TRAIN_PKL = os.path.join(OUTPUT_DIR, "train_sequences.pkl")
VAL_PKL = os.path.join(OUTPUT_DIR, "val_sequences.pkl")
SCALER_PKL = os.path.join(OUTPUT_DIR, "scaler.pkl")
META_JSON = os.path.join(OUTPUT_DIR, "meta.json")


# ---------------------------------------------------------------------------
# 2. 数据加载与清洗
# ---------------------------------------------------------------------------

def load_and_clean(csv_path: str) -> pd.DataFrame:
    """加载 CSV，按圈切分，删除重复/异常时间戳。"""
    df = pd.read_csv(csv_path)
    print(f"[Load] Raw rows: {len(df)}, columns: {list(df.columns)}")

    # 重命名
    df = df.rename(columns={
        "lap_time": "time",
        "world_position_X": "pos_x",
        "world_position_Y": "pos_y",
        "world_position_Z": "pos_z",
        "velocity_X": "vel_x",
        "velocity_Y": "vel_y",
        "velocity_Z": "vel_z",
        "gforce_Y": "lateral_g",
        "throttle": "throttle",
        "brake": "brake",
        "steering": "steering",
        "gear": "gear",
        "rpm": "rpm",
        "lapNum": "lap_num",
    })

    cleaned_laps: List[pd.DataFrame] = []
    for lap, g in df.groupby("lap_num"):
        g = g.copy().sort_values("time").reset_index(drop=True)
        # 删除重复时间戳（保留第一条）
        g = g.drop_duplicates(subset="time", keep="first")
        # 删除时间倒流行（跨圈边界残留）
        dt = np.diff(g["time"].values, prepend=g["time"].iloc[0])
        g = g[dt >= 0].reset_index(drop=True)
        if len(g) > 100:
            cleaned_laps.append(g)

    df_clean = pd.concat(cleaned_laps, ignore_index=True)
    print(f"[Clean] After dedup/filter: {len(df_clean)} rows, {df_clean['lap_num'].nunique()} laps")
    return df_clean


# ---------------------------------------------------------------------------
# 3. 特征工程
# ---------------------------------------------------------------------------

def engineer_features(df: pd.DataFrame) -> Tuple[pd.DataFrame, List[str]]:
    """计算衍生特征。"""
    df["speed"] = np.sqrt(df["vel_x"] ** 2 + df["vel_y"] ** 2 + df["vel_z"] ** 2)

    # Longitudinal G: dv/dt / g
    t = df["time"].values
    df["long_g"] = np.gradient(df["speed"].values, t) / 9.80665

    # Yaw rate from world_right rotation
    rx = df["world_right_X"].values
    rz = df["world_right_Z"].values
    drx = np.gradient(rx, t)
    drz = np.gradient(rz, t)
    df["yaw_rate"] = rx * drz - rz * drx

    # Slip ratio (simplified)
    df["slip_ratio"] = np.where(
        df["speed"] < 5.0,
        0.0,
        np.clip((df["throttle"] * 80.0 - df["speed"]) / (df["speed"] + 1e-6), -1.0, 1.0),
    )

    # Combined G
    df["combined_g"] = np.sqrt(df["long_g"] ** 2 + df["lateral_g"] ** 2)

    feature_cols = [
        "speed", "lateral_g", "long_g", "yaw_rate",
        "steering", "throttle", "brake", "slip_ratio", "gear", "rpm",
    ]
    return df, feature_cols


# ---------------------------------------------------------------------------
# 4. 平滑与过滤
# ---------------------------------------------------------------------------

def smooth_and_clip(df: pd.DataFrame, feature_cols: List[str], window: int = 5) -> pd.DataFrame:
    """按圈滑动平均平滑 + 物理极限裁剪 + 删除静止行。"""
    smoothed: List[pd.DataFrame] = []
    for lap, g in df.groupby("lap_num"):
        g = g.copy().sort_values("time").reset_index(drop=True)
        for col in feature_cols:
            if col in ("gear", "rpm"):
                continue
            g[col] = g[col].rolling(window=window, center=True, min_periods=1).mean()
        smoothed.append(g)

    df = pd.concat(smoothed, ignore_index=True)

    df["lateral_g"] = np.clip(df["lateral_g"], -5.0, 5.0)
    df["long_g"] = np.clip(df["long_g"], -5.0, 5.0)
    df["yaw_rate"] = np.clip(df["yaw_rate"], -3.0, 3.0)
    df["speed"] = np.clip(df["speed"], 0.0, 400.0)
    df["steering"] = np.clip(df["steering"], -1.0, 1.0)
    df["throttle"] = np.clip(df["throttle"], 0.0, 1.0)
    df["brake"] = np.clip(df["brake"], 0.0, 1.0)
    df["slip_ratio"] = np.clip(df["slip_ratio"], -1.0, 1.0)

    # 删除静止/极低速度行
    df = df[df["speed"] > 1.0].reset_index(drop=True)
    print(f"[Smooth] After clip & filter: {len(df)} rows")
    return df


# ---------------------------------------------------------------------------
# 5. 自动标注（基于车辆动力学规则）
# ---------------------------------------------------------------------------

def auto_label(df: pd.DataFrame) -> pd.DataFrame:
    """
    三分类标注：0=Understeer, 1=Oversteer, 2=Perfect
    大幅降低阈值，覆盖更多真实驾驶场景。
    """
    n = len(df)
    labels = np.full(n, -1, dtype=int)

    lat = df["lateral_g"].values
    steer = df["steering"].values
    yaw = df["yaw_rate"].values
    combined = df["combined_g"].values

    # Understeer: 高侧向负荷 + 明显转向 + 车辆响应不足
    under = (
        (np.abs(lat) > 0.8)
        & (np.abs(steer) > 0.08)
        & (np.abs(yaw) < np.abs(steer) * 2.0)
    )
    labels[under] = 0

    # Oversteer: 侧向滑动 + 反打方向 + 车辆旋转过快
    over = (
        (np.abs(lat) > 0.5)
        & (steer * yaw < 0)
        & (np.abs(yaw) > np.abs(steer) * 2.0)
    )
    labels[over] = 1

    # Perfect Edge: 合成 G 处于高抓地区间，且未触发其他规则
    perfect = (
        (combined >= 0.7)
        & (combined <= 2.0)
        & (np.abs(steer) > 0.03)
        & (labels == -1)
    )
    labels[perfect] = 2

    df["label"] = labels
    counts = {
        "understeer": int(np.sum(labels == 0)),
        "oversteer": int(np.sum(labels == 1)),
        "perfect": int(np.sum(labels == 2)),
        "unlabeled": int(np.sum(labels == -1)),
    }
    print(f"[Label] Counts: {counts}")
    return df


# ---------------------------------------------------------------------------
# 6. 滑动窗口 + 样本增强
# ---------------------------------------------------------------------------

def create_sequences(
    df: pd.DataFrame, feature_cols: List[str], seq_len: int, stride: int
) -> Tuple[np.ndarray, np.ndarray]:
    """按圈切分生成序列，并做简单的过采样平衡。"""
    sequences: List[np.ndarray] = []
    seq_labels: List[int] = []

    for _, g in df.groupby("lap_num"):
        g = g.sort_values("time").reset_index(drop=True)
        feat = g[feature_cols].values.astype(np.float32)
        lab = g["label"].values.astype(np.int64)

        for start in range(0, len(feat) - seq_len + 1, stride):
            end = start + seq_len
            seq = feat[start:end]
            lbl_window = lab[start:end]

            # 窗口中有效标签（非 -1）必须占一定比例
            valid_mask = lbl_window != -1
            if np.sum(valid_mask) < seq_len * 0.25:
                continue

            # 取窗口内众数标签；若三种标签数量相同，优先 Perfect > Understeer > Oversteer
            mode_result = pd.Series(lbl_window[valid_mask]).mode()
            if len(mode_result) == 0:
                continue
            majority = int(mode_result.iloc[0])
            sequences.append(seq)
            seq_labels.append(majority)

    if not sequences:
        raise RuntimeError("No valid sequences generated.")

    X = np.stack(sequences, axis=0)
    y = np.array(seq_labels, dtype=np.int64)
    print(f"[Sequence] Total: {len(X)}, shape: {X.shape}, dist: {np.bincount(y, minlength=3)}")
    return X, y


def balance_oversample(X: np.ndarray, y: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """对少数类随机复制过采样，使各类样本数接近最大类。"""
    classes, counts = np.unique(y, return_counts=True)
    if len(classes) < 2:
        return X, y
    max_count = int(counts.max())

    balanced_X: List[np.ndarray] = []
    balanced_y: List[int] = []

    for cls in classes:
        idx = np.where(y == cls)[0]
        n = len(idx)
        if n < max_count:
            # 随机过采样
            extra = np.random.choice(idx, size=max_count - n, replace=True)
            idx = np.concatenate([idx, extra])
        balanced_X.append(X[idx])
        balanced_y.append(y[idx])

    X_bal = np.concatenate(balanced_X, axis=0)
    y_bal = np.concatenate(balanced_y, axis=0)

    # Shuffle
    perm = np.random.permutation(len(X_bal))
    return X_bal[perm], y_bal[perm]


# ---------------------------------------------------------------------------
# 7. 归一化
# ---------------------------------------------------------------------------

def normalize(
    X_train: np.ndarray, X_val: np.ndarray
) -> Tuple[np.ndarray, np.ndarray, StandardScaler]:
    N_train, T, F = X_train.shape
    N_val = X_val.shape[0]
    X_train_flat = X_train.reshape(-1, F)
    X_val_flat = X_val.reshape(-1, F)

    scaler = StandardScaler()
    X_train_flat = scaler.fit_transform(X_train_flat)
    X_val_flat = scaler.transform(X_val_flat)

    return X_train_flat.reshape(N_train, T, F), X_val_flat.reshape(N_val, T, F), scaler


# ---------------------------------------------------------------------------
# 8. 主流程
# ---------------------------------------------------------------------------

def main() -> None:
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    np.random.seed(RANDOM_SEED)

    df = load_and_clean(RAW_CSV_PATH)
    df, feature_cols = engineer_features(df)
    df = smooth_and_clip(df, feature_cols)
    df = auto_label(df)
    X, y = create_sequences(df, feature_cols, SEQUENCE_LENGTH, STRIDE)

    # 训练/验证分割
    indices = np.random.permutation(len(X))
    split = int(len(X) * (1 - TEST_SPLIT))
    tr_idx, val_idx = indices[:split], indices[split:]
    X_train, y_train = X[tr_idx], y[tr_idx]
    X_val, y_val = X[val_idx], y[val_idx]

    # 过采样平衡训练集
    X_train, y_train = balance_oversample(X_train, y_train)

    # 归一化
    X_train, X_val, scaler = normalize(X_train, X_val)

    # 保存
    with open(TRAIN_PKL, "wb") as f:
        pickle.dump({"X": X_train, "y": y_train}, f)
    with open(VAL_PKL, "wb") as f:
        pickle.dump({"X": X_val, "y": y_val}, f)
    with open(SCALER_PKL, "wb") as f:
        pickle.dump(scaler, f)

    meta = {
        "n_features": len(feature_cols),
        "feature_names": feature_cols,
        "sequence_length": SEQUENCE_LENGTH,
        "n_classes": 3,
        "class_names": ["understeer", "oversteer", "perfect"],
        "train_samples": int(len(X_train)),
        "val_samples": int(len(X_val)),
        "train_dist": [int(c) for c in np.bincount(y_train, minlength=3)],
        "val_dist": [int(c) for c in np.bincount(y_val, minlength=3)],
    }
    with open(META_JSON, "w") as f:
        json.dump(meta, f, indent=2)

    print("[Done] Preprocessing complete.")
    print(f"  Train: {meta['train_samples']} sequences, dist: {meta['train_dist']}")
    print(f"  Val:   {meta['val_samples']} sequences, dist: {meta['val_dist']}")
    print(f"  Saved to: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
