"""
corner_net.py
赛道级虚拟赛车教练 - 深度学习模型定义
基于 LSTM 的弯道动态评价网络，将多维时序信号映射到驾驶状态分类。

注意：torch 为可选依赖。若未安装，模型类不可用，但 FeatureExtractor 仍可工作。
"""

from typing import Tuple, Optional
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


class CornerLSTMNet:
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
        if not _HAS_TORCH:
            raise RuntimeError("PyTorch 未安装，无法初始化 CornerLSTMNet")

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

    def forward(self, x):
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

    def predict_proba(self, x):
        """返回各类别的概率分布"""
        self.eval()
        with torch.no_grad():
            logits = self.forward(x)
            probs = F.softmax(logits, dim=-1)
        return probs

    def to(self, device):
        return self

    def eval(self):
        pass

    def load_state_dict(self, state_dict):
        pass

    def state_dict(self):
        return {}


class TelemetryFeatureExtractor:
    """
    遥测数据特征提取器。
    将原始 CSV 列映射为模型输入张量/数组。
    """

    FEATURE_COLS = [
        "speed",
        "yaw_rate",
        "lat_g",
        "long_g",
        "steering_angle",
        "slip_ratio",
    ]

    COL_ALIASES = {
        "speed": ["speed", "velocity", "spd", "kmh", "km/h", "mps", "m/s"],
        "yaw_rate": ["yaw_rate", "yawrate", "yaw", "yawr"],
        "lat_g": ["lat_g", "lateral_g", "latg", "g_lat", "g_lateral", "ay"],
        "long_g": ["long_g", "longitudinal_g", "longg", "g_long", "g_longitudinal", "ax"],
        "steering_angle": ["steering_angle", "steering", "steer", "wheel_angle", "steeringangle"],
        "slip_ratio": ["slip_ratio", "slipratio", "slip", "slip_rate"],
    }

    @classmethod
    def normalize_columns(cls, df_cols):
        """根据别名表将原始列名映射到标准特征名"""
        lower_cols = {c.lower().replace(" ", "_"): c for c in df_cols}
        mapping = {}
        for std_name, aliases in cls.COL_ALIASES.items():
            for alias in aliases:
                if alias in lower_cols:
                    mapping[std_name] = lower_cols[alias]
                    break
        return mapping

    @classmethod
    def extract_sequence(cls, df, col_mapping: dict, seq_len: int = 128):
        """
        从 DataFrame 中提取固定长度的特征序列。
        返回 numpy ndarray (1, seq_len, input_dim) 或 torch Tensor
        """
        features = []
        for std_name in cls.FEATURE_COLS:
            col = col_mapping.get(std_name)
            if col and col in df.columns:
                series = df[col].fillna(0).to_numpy(dtype="float32")
            else:
                series = np.zeros(len(df), dtype="float32")
            features.append(series)

        mat = np.stack(features, axis=1).astype(np.float32)

        n, d = mat.shape
        if n < seq_len:
            pad = np.zeros((seq_len - n, d), dtype=np.float32)
            mat = np.concatenate([mat, pad], axis=0)
        elif n > seq_len:
            indices = np.linspace(0, n - 1, seq_len).astype(np.int64)
            mat = mat[indices]

        # 标准化：每列减均值除标准差
        mean = mat.mean(axis=0, keepdims=True)
        std = mat.std(axis=0, keepdims=True) + 1e-6
        mat = (mat - mean) / std

        if _HAS_TORCH:
            return torch.tensor(mat, dtype=torch.float32).unsqueeze(0)
        return mat[np.newaxis, ...]


def build_model(
    input_dim: int = 6,
    hidden_dim: int = 128,
    num_layers: int = 2,
    num_classes: int = 3,
    device: str = "cpu",
):
    """工厂函数：构建模型"""
    if not _HAS_TORCH:
        return None
    model = CornerLSTMNet(
        input_dim=input_dim,
        hidden_dim=hidden_dim,
        num_layers=num_layers,
        num_classes=num_classes,
    )
    return model
