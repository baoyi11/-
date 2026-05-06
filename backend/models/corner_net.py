"""
corner_net.py
赛道级虚拟赛车教练 - 深度学习模型定义
基于 LSTM 的弯道动态评价网络，将多维时序信号映射到驾驶状态分类。

注意：torch 为可选依赖。若未安装，模型类不可用，但 FeatureExtractor 仍可工作。
"""

from typing import Tuple, Optional
import os
import numpy as np

try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    _HAS_TORCH = True
except ImportError:
    _HAS_TORCH = False
    torch = None  # type: ignore
    nn = None  # type: ignore
    F = None  # type: ignore


if _HAS_TORCH:
    class CornerLSTMNet(nn.Module):
        """
        基于双层 BiLSTM 的弯道动态评价网络。

        输入:  (batch, seq_len, feature_dim)
        输出:  (batch, num_classes) 的 logits
               num_classes = 3 -> [转向不足 Understeer, 转向过度 Oversteer, 完美附着力 Perfect]
        """

        def __init__(
            self,
            input_dim: int = 6,
            hidden_dim: int = 128,
            num_layers: int = 2,
            num_classes: int = 3,
            dropout: float = 0.3,
        ):
            super(CornerLSTMNet, self).__init__()
            self.input_dim = input_dim
            self.hidden_dim = hidden_dim
            self.num_layers = num_layers
            self.num_classes = num_classes

            # 双层双向 LSTM，捕捉前后向时序依赖
            self.lstm = nn.LSTM(
                input_size=input_dim,
                hidden_size=hidden_dim,
                num_layers=num_layers,
                batch_first=True,
                bidirectional=True,
                dropout=dropout if num_layers > 1 else 0.0,
            )

            # 时序注意力：给不同时间步分配不同权重
            self.attention = nn.Sequential(
                nn.Linear(hidden_dim * 2, 64),
                nn.Tanh(),
                nn.Linear(64, 1),
            )

            # 分类头
            self.classifier = nn.Sequential(
                nn.Linear(hidden_dim * 2, 128),
                nn.ReLU(),
                nn.Dropout(dropout),
                nn.Linear(128, num_classes),
            )

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            """
            Args:
                x: Tensor of shape (batch, seq_len, input_dim)
            Returns:
                logits: Tensor of shape (batch, num_classes)
            """
            # LSTM 输出: (batch, seq_len, hidden_dim * 2)
            lstm_out, _ = self.lstm(x)

            # 注意力权重: (batch, seq_len, 1)
            attn_weights = F.softmax(self.attention(lstm_out), dim=1)

            # 加权求和得到上下文向量: (batch, hidden_dim * 2)
            context = torch.sum(attn_weights * lstm_out, dim=1)

            # 分类
            logits = self.classifier(context)
            return logits

        def predict_proba(self, x: torch.Tensor) -> torch.Tensor:
            """返回各类别的概率分布"""
            self.eval()
            with torch.no_grad():
                logits = self.forward(x)
                probs = F.softmax(logits, dim=-1)
            return probs
else:
    class CornerLSTMNet:
        """PyTorch 未安装时的占位类，实例化会抛出 RuntimeError。"""

        def __init__(self, *args, **kwargs):
            raise RuntimeError("PyTorch 未安装，无法初始化 CornerLSTMNet。请执行: pip install torch")


class TelemetryFeatureExtractor:
    """
    遥测数据特征提取器。
    将原始 CSV 列映射为模型输入张量/数组。
    支持 10 维真实遥测特征。
    """

    FEATURE_COLUMNS = [
        "speed",
        "lateral_g",
        "long_g",
        "yaw_rate",
        "steering",
        "throttle",
        "brake",
        "slip_ratio",
        "gear",
        "rpm",
    ]

    def __init__(self, seq_len: int = 50, scaler_path: str | None = None):
        self.seq_len = seq_len
        self.scaler = None
        if scaler_path and os.path.exists(scaler_path):
            import pickle
            with open(scaler_path, "rb") as f:
                self.scaler = pickle.load(f)

    def _normalize(self, mat: np.ndarray) -> np.ndarray:
        """使用训练时保存的 StandardScaler 或在线 z-score 归一化。"""
        if self.scaler is not None:
            # scaler 期望 (n_samples, n_features)
            orig_shape = mat.shape
            flat = mat.reshape(-1, orig_shape[-1])
            flat = self.scaler.transform(flat)
            return flat.reshape(orig_shape)
        mean = np.mean(mat, axis=0, keepdims=True)
        std = np.std(mat, axis=0, keepdims=True) + 1e-6
        return (mat - mean) / std

    def extract(self, df) -> np.ndarray:
        """
        从 pandas DataFrame 中提取特征矩阵。
        返回 shape: (n_windows, seq_len, n_features) 的 numpy 数组。
        """
        features = []
        for col in self.FEATURE_COLUMNS:
            if col in df.columns:
                features.append(df[col].values)
            else:
                features.append(np.zeros(len(df)))

        mat = np.stack(features, axis=1).astype(np.float32)
        mat = self._normalize(mat)

        windows = []
        step = max(1, len(mat) // 20)
        for i in range(0, len(mat) - self.seq_len + 1, step):
            windows.append(mat[i : i + self.seq_len])

        if not windows:
            if len(mat) < self.seq_len:
                pad = np.zeros((self.seq_len - len(mat), mat.shape[1]), dtype=np.float32)
                windows.append(np.concatenate([mat, pad], axis=0))
            else:
                windows.append(mat[: self.seq_len])

        return np.stack(windows, axis=0)

    def to_tensor(self, arr: np.ndarray) -> "torch.Tensor":
        """将 numpy 数组转为 torch Tensor。"""
        if _HAS_TORCH and torch is not None:
            return torch.from_numpy(arr)
        raise RuntimeError("PyTorch 未安装")

    @staticmethod
    def normalize_columns(columns):
        """
        将原始列名映射为标准化特征名。
        返回字典 {标准化名: 原始列名}。
        """
        col_list = list(columns)
        mapping = {}
        aliases = {
            "speed": ["speed", "velocity", "vel", "spd", "km/h", "mph"],
            "lateral_g": ["lateral_g", "lat_g", "lat_acc", "g_lat", "g_force_lat", "gforce_y", "gforce_y", "ay", "gy"],
            "long_g": ["long_g", "longitudinal_g", "long_acc", "g_long", "g_force_long", "ax", "gx"],
            "yaw_rate": ["yaw_rate", "yawrate", "yaw", "yaw_speed"],
            "steering": ["steering", "steer", "steering_angle", "wheel_angle", "steer_deg"],
            "throttle": ["throttle", "throttle_input", "gas"],
            "brake": ["brake", "brake_input"],
            "slip_ratio": ["slip_ratio", "slip", "sliprate", "tire_slip"],
            "gear": ["gear", "gear_num"],
            "rpm": ["rpm", "engine_rpm", "revs"],
        }
        for std_name, aliases_list in aliases.items():
            for col in col_list:
                low = str(col).lower().replace(" ", "_").replace("(", "").replace(")", "")
                if low in aliases_list:
                    mapping[std_name] = col
                    break
        return mapping

    @classmethod
    def extract_sequence(cls, df, col_mapping, seq_len=50, scaler_path: str | None = None):
        """
        从 DataFrame 中提取固定长度的特征序列，用于模型输入。
        返回 numpy ndarray 或 torch Tensor。
        """
        features = []
        for std_name in cls.FEATURE_COLUMNS:
            raw_col = col_mapping.get(std_name)
            if raw_col and raw_col in df.columns:
                features.append(df[raw_col].values)
            else:
                features.append(np.zeros(len(df)))

        mat = np.stack(features, axis=1).astype(np.float32)

        # 归一化
        extractor = cls(seq_len=seq_len, scaler_path=scaler_path)
        mat = extractor._normalize(mat)

        if len(mat) < seq_len:
            pad = np.zeros((seq_len - len(mat), mat.shape[1]), dtype=np.float32)
            mat = np.concatenate([mat, pad], axis=0)
        elif len(mat) > seq_len:
            indices = np.linspace(0, len(mat) - 1, seq_len, dtype=np.int32)
            mat = mat[indices]

        mat = np.expand_dims(mat, axis=0)

        if _HAS_TORCH and torch is not None:
            return torch.from_numpy(mat)
        return mat


def build_model(
    input_dim: int = 10,
    hidden_dim: int = 64,
    num_layers: int = 2,
    num_classes: int = 3,
    dropout: float = 0.3,
    device: str = "cpu",
) -> "CornerLSTMNet":
    """工厂函数：构建并返回 CornerLSTMNet 实例。"""
    model = CornerLSTMNet(
        input_dim=input_dim,
        hidden_dim=hidden_dim,
        num_layers=num_layers,
        num_classes=num_classes,
        dropout=dropout,
    )
    if _HAS_TORCH and torch is not None:
        model = model.to(torch.device(device))
    return model
