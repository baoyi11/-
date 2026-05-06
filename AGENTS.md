# 赛道级虚拟赛车教练 (TrackMaster AI Coach)

## 项目概览
基于时序遥测数据的弯道动态评价系统。用户上传赛车游戏 CSV 遥测数据，系统自动切分弯道、评估驾驶表现并生成专业且幽默的反馈。

## 版本技术栈
- **Framework**: Next.js 16 (App Router) + FastAPI (Python)
- **Core**: React 19, TypeScript 5, Python 3.12
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **可视化**: Plotly.js, react-leaflet
- **AI 模型**: PyTorch (LSTM, 可选依赖)

## 目录结构

```
├── backend/                 # FastAPI 后端与 AI 模型
│   ├── core/                # 业务逻辑
│   │   ├── parser.py        # CSV 遥测数据解析
│   │   ├── segmentation.py  # 弯道自动切分算法
│   │   ├── evaluator.py     # 物理规则评分 + AI 推理
│   │   └── feedback.py      # 趣味文案生成
│   ├── models/
│   │   └── corner_net.py    # PyTorch LSTM 模型定义
│   ├── main.py              # FastAPI 入口
│   ├── train.py             # Mock 数据生成 + 模型训练
│   ├── generate_mock_csv.py # 测试数据生成器
│   └── requirements.txt     # Python 依赖
├── src/
│   ├── app/
│   │   ├── api/py/[...path]/route.ts  # Next.js → FastAPI 代理
│   │   ├── page.tsx         # 主页面
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/              # shadcn/ui 组件
│   │   ├── UploadZone.tsx   # CSV 拖拽上传
│   │   ├── RadarChart.tsx   # 多维雷达图 (Recharts)
│   │   ├── telemetry/
│   │   │   ├── FrictionCircle.tsx  # Plotly G值摩擦圆
│   │   │   └── TelemetryCharts.tsx # Plotly 时序折线图
│   │   ├── track/
│   │   │   └── TrackMap.tsx        # Leaflet 轨迹热力图
│   │   └── feedback/
│   │       ├── FeedbackPanel.tsx   # 总评与文案
│   │       └── CornerDetailPanel.tsx # 单弯道详情
│   ├── server.ts            # 自定义 Next.js 服务器 (同时启动 FastAPI)
│   └── lib/
│       └── utils.ts         # cn 工具函数
├── scripts/
│   ├── dev.sh, build.sh, start.sh
├── .coze                    # 沙箱部署配置 (勿改)
├── next.config.ts
└── package.json
```

## 构建和测试命令
- **前端开发**: `pnpm dev` (tsx watch src/server.ts，自动启动 FastAPI)
- **前端构建**: `pnpm build`
- **TypeScript 检查**: `pnpm ts-check`
- **Lint 检查**: `pnpm lint:build`
- **Python 依赖**: `pip3 install -r backend/requirements.txt`
- **模型训练**: `cd backend && python3 train.py`

## 服务架构
- **Next.js 自定义服务器** (`src/server.ts`) 监听 5000 端口
- **FastAPI** (`backend/main.py`) 监听 8000 端口
- Next.js API Route `/api/py/[...path]` 将请求代理到 FastAPI
- 开发模式下，server.ts 自动 `spawn` 启动 Python 后端

## 代码风格指南
- TypeScript strict 模式，禁止隐式 `any`
- React 组件使用函数式组件 + Hooks
- Python 代码使用类型注解 (PEP 484)
- Plotly 图表组件需使用 `use client` 指令

## 测试说明
- 后端测试数据: `backend/generate_mock_csv.py` 生成 `mock_telemetry.csv`
- API 冒烟测试:
  - `GET /api/py/health`
  - `POST /api/py/upload` (multipart/form-data)
  - `POST /api/py/analyze` (multipart/form-data)

## 安全注意事项
- 文件上传限制 50MB，仅接受 CSV
- Python 后端无鉴权（内网代理）
- torch 为可选依赖，缺失时降级为物理规则评分
