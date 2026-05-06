"""
train.py
赛道级虚拟赛车教练 - 基于真实遥测数据的模型训练脚本

运行方式:
    cd backend && python train.py
"""

from __future__ import annotations

import json
import os
import pickle
import sys
from typing import Tuple, Dict, List

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

from models.corner_net import CornerLSTMNet

# ==================== 超参数 ====================
SEED = 42
HIDDEN_DIM = 128
NUM_LAYERS = 2
NUM_CLASSES = 3
BATCH_SIZE = 64
EPOCHS = 40
LR = 1e-3
WEIGHT_DECAY = 1e-4
PATIENCE = 8  # Early stopping patience
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

PROCESSED_DIR = os.path.join(BACKEND_DIR, "processed")
MODEL_SAVE_PATH = os.path.join(BACKEND_DIR, "models", "corner_net.pth")
TRAIN_HISTORY_PATH = os.path.join(BACKEND_DIR, "models", "train_history.json")


def set_seed(seed: int = SEED):
    import random
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


# ==================== 数据集 ====================
class TelemetryDataset(Dataset):
    """加载 prepare_real_data.py 生成的 pickle 数据"""

    def __init__(self, pkl_path: str):
        with open(pkl_path, "rb") as f:
            data = pickle.load(f)
        self.X = torch.from_numpy(data["X"]).float()
        self.y = torch.from_numpy(data["y"]).long()
        assert len(self.X) == len(self.y)

    def __len__(self) -> int:
        return len(self.X)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, torch.Tensor]:
        return self.X[idx], self.y[idx]


# ==================== 训练辅助 ====================

def train_epoch(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    optimizer: optim.Optimizer,
) -> Tuple[float, float]:
    model.train()
    total_loss = 0.0
    correct = 0
    total = 0

    for xb, yb in loader:
        xb, yb = xb.to(DEVICE), yb.to(DEVICE)
        optimizer.zero_grad()
        logits = model(xb)
        loss = criterion(logits, yb)
        loss.backward()
        optimizer.step()

        total_loss += loss.item() * len(yb)
        preds = logits.argmax(dim=1)
        correct += (preds == yb).sum().item()
        total += len(yb)

    return total_loss / total, correct / total


def eval_epoch(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
) -> Tuple[float, float, Dict[str, float]]:
    model.eval()
    total_loss = 0.0
    correct = 0
    total = 0
    all_preds: List[int] = []
    all_labels: List[int] = []

    with torch.no_grad():
        for xb, yb in loader:
            xb, yb = xb.to(DEVICE), yb.to(DEVICE)
            logits = model(xb)
            loss = criterion(logits, yb)
            total_loss += loss.item() * len(yb)
            preds = logits.argmax(dim=1)
            correct += (preds == yb).sum().item()
            total += len(yb)
            all_preds.extend(preds.cpu().numpy().tolist())
            all_labels.extend(yb.cpu().numpy().tolist())

    # Per-class accuracy
    class_names = ["understeer", "oversteer", "perfect"]
    per_class: Dict[str, float] = {}
    for cls in range(NUM_CLASSES):
        mask = np.array(all_labels) == cls
        if mask.sum() > 0:
            acc = (np.array(all_preds)[mask] == cls).mean()
            per_class[f"{class_names[cls]}_acc"] = round(float(acc), 4)

    return total_loss / total, correct / total, per_class


# ==================== 主流程 ====================

def main():
    set_seed()
    os.makedirs(os.path.dirname(MODEL_SAVE_PATH), exist_ok=True)

    # ---- 1. 加载预处理数据 ----
    train_pkl = os.path.join(PROCESSED_DIR, "train_sequences.pkl")
    val_pkl = os.path.join(PROCESSED_DIR, "val_sequences.pkl")
    meta_json = os.path.join(PROCESSED_DIR, "meta.json")

    if not os.path.exists(train_pkl) or not os.path.exists(val_pkl):
        print("[ERROR] 预处理数据不存在。请先运行: python prepare_real_data.py")
        sys.exit(1)

    with open(meta_json, "r") as f:
        meta = json.load(f)

    input_dim = meta["n_features"]
    seq_len = meta["sequence_length"]
    print(f"[Data] Features: {input_dim}, SeqLen: {seq_len}, Classes: {NUM_CLASSES}")
    print(f"[Data] Train: {meta['train_samples']}, Val: {meta['val_samples']}")

    train_ds = TelemetryDataset(train_pkl)
    val_ds = TelemetryDataset(val_pkl)

    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True, drop_last=True)
    val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False)

    # ---- 2. 初始化模型（冷启动）----
    model = CornerLSTMNet(
        input_dim=input_dim,
        hidden_dim=HIDDEN_DIM,
        num_layers=NUM_LAYERS,
        num_classes=NUM_CLASSES,
        dropout=0.3,
    ).to(DEVICE)

    print(f"[Model] Parameters: {sum(p.numel() for p in model.parameters()):,}")
    print(f"[Device] {DEVICE}")

    # ---- 3. 损失与优化 ----
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=LR, weight_decay=WEIGHT_DECAY)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="min", factor=0.5, patience=3, verbose=True
    )

    # ---- 4. 训练循环 ----
    best_val_loss = float("inf")
    best_epoch = 0
    no_improve = 0
    history: Dict[str, List[float]] = {
        "epoch": [],
        "train_loss": [],
        "train_acc": [],
        "val_loss": [],
        "val_acc": [],
    }

    print("\n[Training] Starting...")
    for epoch in range(1, EPOCHS + 1):
        train_loss, train_acc = train_epoch(model, train_loader, criterion, optimizer)
        val_loss, val_acc, per_class = eval_epoch(model, val_loader, criterion)
        scheduler.step(val_loss)

        history["epoch"].append(epoch)
        history["train_loss"].append(round(train_loss, 4))
        history["train_acc"].append(round(train_acc, 4))
        history["val_loss"].append(round(val_loss, 4))
        history["val_acc"].append(round(val_acc, 4))

        print(
            f"Epoch {epoch:02d}/{EPOCHS} | "
            f"Train Loss: {train_loss:.4f} Acc: {train_acc:.4f} | "
            f"Val Loss: {val_loss:.4f} Acc: {val_acc:.4f} | "
            f"Per-class: {per_class}"
        )

        # Early stopping + best model saving
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            best_epoch = epoch
            no_improve = 0
            torch.save(model.state_dict(), MODEL_SAVE_PATH)
            print(f"  -> Saved best model (val_loss={val_loss:.4f})")
        else:
            no_improve += 1
            if no_improve >= PATIENCE:
                print(f"\n[Early Stop] No improvement for {PATIENCE} epochs.")
                break

    # ---- 5. 保存训练历史 ----
    with open(TRAIN_HISTORY_PATH, "w") as f:
        json.dump(history, f, indent=2)

    print(f"\n[Done] Best model at epoch {best_epoch}, val_loss={best_val_loss:.4f}")
    print(f"[Done] Model saved to: {MODEL_SAVE_PATH}")
    print(f"[Done] History saved to: {TRAIN_HISTORY_PATH}")


if __name__ == "__main__":
    main()
