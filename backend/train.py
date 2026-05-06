"""
train.py
赛道级虚拟赛车教练 - 模型训练脚本

功能：
1. 生成逼真的模拟遥测数据（Mock Telemetry Data）
2. 将时序数据标注为：转向不足(0)、转向过度(1)、完美附着力(2)
3. 训练 LSTM + Attention 网络
4. 保存权重文件到 models/corner_net.pth

运行方式:
    cd backend && python train.py
"""

import os
import random
import sys
from typing import Tuple, List

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

try:
    import numpy as np
    import torch
    import torch.nn as nn
    import torch.optim as optim
    from torch.utils.data import Dataset, DataLoader
except ImportError as e:
    print(f"[ERROR] 缺少依赖: {e}")
    print("请先安装 PyTorch: pip3 install torch")
    sys.exit(1)

from models.corner_net import CornerLSTMNet, TelemetryFeatureExtractor


# ==================== 超参数 ====================
SEED = 42
INPUT_DIM = 6
HIDDEN_DIM = 128
NUM_LAYERS = 2
NUM_CLASSES = 3
SEQ_LEN = 128
BATCH_SIZE = 64
EPOCHS = 80
LR = 1e-3
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
MODEL_SAVE_PATH = "models/corner_net.pth"


def set_seed(seed: int = SEED):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


# ==================== Mock 数据生成器 ====================
class MockTelemetryGenerator:
    """
    基于简化的车辆动力学模型生成逼真的遥测时序数据。

    生成三种类别的数据：
    - class 0 (Understeer): 转向不足特征 -> 转向角大但横摆不足，出弯油门过早导致推头
    - class 1 (Oversteer): 转向过度特征 -> 转向角突变，后轮滑移率高，车尾不安分
    - class 2 (Perfect): 完美附着力 -> 转向平滑，G 值利用率高且均匀，滑移率适中
    """

    FS = 20.0  # 采样频率 Hz

    def __init__(self, seq_len: int = SEQ_LEN):
        self.seq_len = seq_len
        self.t = np.arange(seq_len) / self.FS

    def _base_corner_profile(self, entry_speed: float = 120.0) -> dict:
        """生成一个基础弯道的速度、G值、转向轮廓"""
        t = self.t
        T = t[-1] if len(t) > 0 else 1.0

        # 速度曲线：入弯减速 -> 弯心最低 -> 出弯加速
        speed = entry_speed * (
            0.6
            + 0.25 * np.cos(np.pi * (t - T * 0.5) / (T * 0.8))
            + 0.15 * np.random.randn(len(t)) * 0.05
        )
        speed = np.clip(speed, 20.0, 250.0)

        # 侧向 G：中间高，两头低
        lat_g = 1.0 * np.sin(np.pi * t / T) + np.random.randn(len(t)) * 0.05
        lat_g = np.clip(lat_g, -0.2, 1.8)

        # 纵向 G：入弯刹车负值，出弯油门正值
        long_g = np.zeros_like(t)
        brake_phase = t < T * 0.35
        accel_phase = t > T * 0.65
        long_g[brake_phase] = -0.8 * (1.0 - t[brake_phase] / (T * 0.35))
        long_g[accel_phase] = 0.6 * ((t[accel_phase] - T * 0.65) / (T * 0.35))
        long_g += np.random.randn(len(t)) * 0.03
        long_g = np.clip(long_g, -1.5, 1.0)

        # 横摆角速度：与侧向 G 和速度相关（简化：yaw_rate ~ lat_g * speed / 100）
        yaw_rate = lat_g * speed / 100.0 + np.random.randn(len(t)) * 0.02

        # 转向角：与横摆角速度正相关，滞后一点
        steer = np.zeros_like(t)
        steer[1:] = np.arctan(yaw_rate[:-1] * 2.5 + 0.1) * 180 / np.pi
        steer += np.random.randn(len(t)) * 1.5
        steer = np.clip(steer, -180.0, 180.0)

        # 滑移率：正常 2-8%
        slip = 3.0 + np.abs(lat_g) * 3.0 + np.random.randn(len(t)) * 0.5
        slip = np.clip(slip, 0.0, 30.0)

        return {
            "speed": speed,
            "yaw_rate": yaw_rate,
            "lat_g": lat_g,
            "long_g": long_g,
            "steering_angle": steer,
            "slip_ratio": slip,
        }

    def generate_understeer(self) -> Tuple[np.ndarray, int]:
        """生成转向不足样本 (class=0)

        特征：
        - 入弯刹车结束过早 -> 缺少 Trail-braking
        - 出弯油门给太早且太猛 -> 前轮负载不足导致推头
        - 转向角偏大但横摆响应不足
        - 滑移率前高后低（前轮在尖叫）
        """
        base = self._base_corner_profile(entry_speed=random.uniform(100.0, 140.0))
        t = self.t
        T = t[-1]

        # 刹车结束过早（30% 处就松完）
        brake_end = int(self.seq_len * 0.30)
        base["long_g"][:brake_end] *= 1.2
        base["long_g"][brake_end:int(self.seq_len * 0.55)] = 0.0

        # 出弯油门过早（60% 处就开始大力给油）
        accel_start = int(self.seq_len * 0.55)
        base["long_g"][accel_start:] = np.linspace(0.1, 0.9, self.seq_len - accel_start)
        base["long_g"] += np.random.randn(self.seq_len) * 0.03

        # 转向偏大但横摆不足（推头）
        base["steering_angle"] *= 1.3
        base["yaw_rate"] *= 0.7

        # 前轮滑移高（出弯给油时尤其高）
        base["slip_ratio"][accel_start:] += random.uniform(5.0, 12.0)
        base["slip_ratio"] = np.clip(base["slip_ratio"], 0.0, 35.0)

        # 速度恢复慢（推头导致出弯加速差）
        base["speed"][accel_start:] *= 0.92

        features = np.stack([
            base["speed"],
            base["yaw_rate"],
            base["lat_g"],
            base["long_g"],
            base["steering_angle"],
            base["slip_ratio"],
        ], axis=1).astype(np.float32)

        return features, 0

    def generate_oversteer(self) -> Tuple[np.ndarray, int]:
        """生成转向过度样本 (class=1)

        特征：
        - 入弯刹车晚且重 -> 重心前移后突然释放导致车尾不安分
        - 转向角输入突兀 -> 快速反打方向
        - 横摆角速度剧烈波动
        - 后轮滑移率极高
        """
        base = self._base_corner_profile(entry_speed=random.uniform(110.0, 150.0))

        # 刹车晚且重（前 20% 几乎没有刹车，然后猛踩）
        late_brake_start = int(self.seq_len * 0.20)
        base["long_g"][:late_brake_start] = 0.0
        base["long_g"][late_brake_start:int(self.seq_len * 0.40)] = -1.2

        # 转向输入突兀
        turn_in = int(self.seq_len * 0.25)
        base["steering_angle"][turn_in:turn_in + 5] += random.uniform(30.0, 60.0)
        # 快速反打
        counter_idx = int(self.seq_len * 0.50)
        if counter_idx + 5 < self.seq_len:
            base["steering_angle"][counter_idx:counter_idx + 5] -= random.uniform(40.0, 80.0)

        # 横摆剧烈波动
        base["yaw_rate"] *= 1.5
        base["yaw_rate"] += np.random.randn(self.seq_len) * 0.15

        # 后轮滑移高（出弯大油门时）
        accel_start = int(self.seq_len * 0.60)
        base["slip_ratio"][accel_start:] += random.uniform(8.0, 18.0)
        base["slip_ratio"] = np.clip(base["slip_ratio"], 0.0, 40.0)

        features = np.stack([
            base["speed"],
            base["yaw_rate"],
            base["lat_g"],
            base["long_g"],
            base["steering_angle"],
            base["slip_ratio"],
        ], axis=1).astype(np.float32)

        return features, 1

    def generate_perfect(self) -> Tuple[np.ndarray, int]:
        """生成完美附着力样本 (class=2)

        特征：
        - 刹车点精准，Trail-braking 平滑
        - 转向输入线性渐进
        - 横摆角速度和侧向 G 高度相关
        - 滑移率始终保持在最佳窗口 (4-10%)
        - 出弯油门线性增加，无突变
        """
        base = self._base_corner_profile(entry_speed=random.uniform(120.0, 160.0))

        # 稍微平滑所有信号
        from numpy.lib.stride_tricks import sliding_window_view
        def smooth(arr, window=3):
            if len(arr) < window:
                return arr
            pad = window // 2
            padded = np.pad(arr, (pad, pad), mode="edge")
            return np.convolve(padded, np.ones(window) / window, mode="valid")

        for key in base:
            base[key] = smooth(base[key], window=3)

        # 滑移率严格控制在最佳窗口
        base["slip_ratio"] = np.clip(base["slip_ratio"], 4.0, 10.0)

        # 转向和横摆高度一致
        ideal_yaw = base["lat_g"] * base["speed"] / 100.0
        base["yaw_rate"] = 0.7 * base["yaw_rate"] + 0.3 * ideal_yaw

        features = np.stack([
            base["speed"],
            base["yaw_rate"],
            base["lat_g"],
            base["long_g"],
            base["steering_angle"],
            base["slip_ratio"],
        ], axis=1).astype(np.float32)

        return features, 2

    def generate_sample(self) -> Tuple[np.ndarray, int]:
        """随机生成一个样本"""
        generators = [
            self.generate_understeer,
            self.generate_oversteer,
            self.generate_perfect,
        ]
        gen = random.choice(generators)
        return gen()


# ==================== PyTorch Dataset ====================
class MockTelemetryDataset(Dataset):
    def __init__(self, n_samples: int = 5000, seq_len: int = SEQ_LEN):
        self.generator = MockTelemetryGenerator(seq_len=seq_len)
        self.samples: List[Tuple[np.ndarray, int]] = []
        print(f"Generating {n_samples} mock telemetry samples...")
        for i in range(n_samples):
            if (i + 1) % 500 == 0:
                print(f"  Generated {i + 1}/{n_samples} samples")
            feat, label = self.generator.generate_sample()
            self.samples.append((feat, label))
        print("Mock data generation complete.")

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        feat, label = self.samples[idx]
        # 标准化：每列减均值除标准差
        mean = feat.mean(axis=0, keepdims=True)
        std = feat.std(axis=0, keepdims=True) + 1e-6
        feat_norm = (feat - mean) / std
        return torch.tensor(feat_norm, dtype=torch.float32), torch.tensor(label, dtype=torch.long)


# ==================== 训练流程 ====================
def train():
    set_seed(SEED)
    os.makedirs("models", exist_ok=True)

    print(f"Device: {DEVICE}")
    print(f"Model: CornerLSTMNet (input={INPUT_DIM}, hidden={HIDDEN_DIM}, layers={NUM_LAYERS})")

    # 数据集
    train_dataset = MockTelemetryDataset(n_samples=6000, seq_len=SEQ_LEN)
    val_dataset = MockTelemetryDataset(n_samples=1200, seq_len=SEQ_LEN)

    train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_dataset, batch_size=BATCH_SIZE, shuffle=False, num_workers=0)

    # 模型
    model = CornerLSTMNet(
        input_dim=INPUT_DIM,
        hidden_dim=HIDDEN_DIM,
        num_layers=NUM_LAYERS,
        num_classes=NUM_CLASSES,
    ).to(DEVICE)

    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=LR)
    scheduler = optim.lr_scheduler.StepLR(optimizer, step_size=30, gamma=0.5)

    best_val_acc = 0.0

    for epoch in range(1, EPOCHS + 1):
        model.train()
        train_loss = 0.0
        train_correct = 0
        train_total = 0

        for batch_idx, (x, y) in enumerate(train_loader):
            x, y = x.to(DEVICE), y.to(DEVICE)
            optimizer.zero_grad()
            logits = model(x)
            loss = criterion(logits, y)
            loss.backward()
            optimizer.step()

            train_loss += loss.item()
            preds = torch.argmax(logits, dim=-1)
            train_correct += (preds == y).sum().item()
            train_total += y.size(0)

        train_acc = train_correct / train_total

        # 验证
        model.eval()
        val_loss = 0.0
        val_correct = 0
        val_total = 0
        with torch.no_grad():
            for x, y in val_loader:
                x, y = x.to(DEVICE), y.to(DEVICE)
                logits = model(x)
                loss = criterion(logits, y)
                val_loss += loss.item()
                preds = torch.argmax(logits, dim=-1)
                val_correct += (preds == y).sum().item()
                val_total += y.size(0)

        val_acc = val_correct / val_total
        scheduler.step()

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            torch.save(model.state_dict(), MODEL_SAVE_PATH)
            print(f"  [*] New best val_acc: {val_acc:.4f}, model saved.")

        if epoch % 5 == 0 or epoch == 1:
            print(
                f"Epoch [{epoch:03d}/{EPOCHS}] "
                f"Train Loss: {train_loss / len(train_loader):.4f} Acc: {train_acc:.4f} | "
                f"Val Loss: {val_loss / len(val_loader):.4f} Acc: {val_acc:.4f}"
            )

    print(f"\nTraining complete. Best validation accuracy: {best_val_acc:.4f}")
    print(f"Model saved to: {MODEL_SAVE_PATH}")


if __name__ == "__main__":
    train()
