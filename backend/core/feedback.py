"""
feedback.py
趣味与专业并存的评价文案生成器。

根据总分段位和单项失误特征，组合生成"专业内核 + 幽默/毒舌外表"的反馈文案。
"""

from typing import Dict, Any, List


# ==================== A. 总评分段位字典 ====================
TIER_FEEDBACK = {
    "alien": {
        "min": 95,
        "title": "外星人级 (Alien)",
        "text": (
            "这动态控制、这走线，牛顿看了都要连夜重写物理定律。"
            "说吧，你的老家在哪个星系？建议直接顶替汉密尔顿上场。"
        ),
    },
    "takumi": {
        "min": 85,
        "title": "拓海级 (Takumi)",
        "text": (
            "完美游走在轮胎附着力的边缘，寻迹刹车和出弯给油丝滑得像是用热刀切黄油。"
            "但在微操上，离打破赛道纪录还差半口气。"
        ),
    },
    "trackday_warrior": {
        "min": 70,
        "title": "周末车神 (Trackday Warrior)",
        "text": (
            "操作很猛，走线很野。看得出你有一颗想上领奖台的心，"
            "但你的轮胎正在疯狂向国际汽联投诉你虐待它们。"
        ),
    },
    "dynamic_hazard": {
        "min": 55,
        "title": "推头/甩尾艺术家 (Dynamic Hazard)",
        "text": (
            "你这不是在开车，你是在和底盘练自由搏击。"
            "入弯前轮尖叫，出弯后轮冒烟，轮胎厂老板都要给你送锦旗了。"
        ),
    },
    "mobile_chicane": {
        "min": 0,
        "title": "移动路障 (Mobile Chicane)",
        "text": (
            "建议把车牌改成'新手实习'。你过弯的速度和轨迹，"
            "让我以为你在赛道上找隐形停车位。去跑跑直线加速赛吧，那里不用打方向盘。"
        ),
    },
}


# ==================== B. 细分维度槽点字典 ====================
# 触发条件：单项得分低于 60 分且对应 flag 为 True
DIMENSION_ROASTS: Dict[str, List[Dict[str, Any]]] = {
    "braking": [
        {
            "flag": "brake_too_early",
            "text": (
                "刹车点找得太早了，你是在给前方的空气让路吗？"
                "这脚刹车踩得像在做足底按摩。"
            ),
        },
        {
            "flag": "brake_too_late_or_lockup",
            "text": (
                "标准的'鱼雷'式入弯！你是想把弯心直接撞穿吗？"
                "ABS 都快被你踩冒烟了。"
            ),
        },
    ],
    "throttle": [
        {
            "flag": "throttle_choppy",
            "text": (
                "你的右脚是在用摩斯密码给发动机发报吗？"
                "给油要线性，不要像触电一样！"
            ),
        },
        {
            "flag": "throttle_too_early_full",
            "text": (
                "出弯油门给得像被踩了尾巴的猫，"
                "牵引力控制系统（TC）的指示灯闪得比迪厅的灯球还亮。"
            ),
        },
    ],
    "racing_line": [
        {
            "flag": "missed_apex",
            "text": (
                "完美避开了弯心（Apex），你是觉得那里的路面烫胎吗？"
                "还是在赛道外场欣赏风景？"
            ),
        },
    ],
    "mid_speed": [
        {
            "flag": "over_slow",
            "text": (
                "你在弯心的速度慢得可以摇下车窗和赛道裁判聊个天了，"
                "赛车硬生生被你开成了老头乐。"
            ),
        },
    ],
}


def get_tier(total_score: float) -> Dict[str, str]:
    """根据加权总分返回对应段位"""
    for key in ["alien", "takumi", "trackday_warrior", "dynamic_hazard", "mobile_chicane"]:
        tier = TIER_FEEDBACK[key]
        if total_score >= tier["min"]:
            return {"key": key, "title": tier["title"], "text": tier["text"]}
    return TIER_FEEDBACK["mobile_chicane"]


def generate_feedback(corner_results: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    生成整圈（或整个上传片段）的综合反馈。

    逻辑：
    1. 计算所有弯道的平均分
    2. 根据总分确定总评段位
    3. 找出表现最差的维度（平均分最低且低于 60）
    4. 检查该维度是否有对应的 flag 吐槽
    5. 组合生成最终文案
    """
    if not corner_results:
        return {
            "tier": "unknown",
            "title": "暂无数据",
            "summary": "未检测到有效弯道，请检查 CSV 数据格式。",
            "roast": "",
            "overall_score": 0.0,
            "dimension_scores": {},
            "worst_dimension": None,
        }

    # 统计所有弯道的各维度平均分
    dim_sums = {"braking": 0.0, "mid_speed": 0.0, "throttle": 0.0, "racing_line": 0.0, "total": 0.0}
    dim_counts = {k: 0 for k in dim_sums}

    # 统计 flag 出现次数（用于定位吐槽点）
    flag_counts: Dict[str, int] = {}

    for r in corner_results:
        scores = r.get("scores", {})
        for k in dim_sums:
            if k in scores:
                dim_sums[k] += scores[k]
                dim_counts[k] += 1
        flags = r.get("flags", {})
        for fkey, fval in flags.items():
            if fval:
                flag_counts[fkey] = flag_counts.get(fkey, 0) + 1

    dim_avgs = {}
    for k in dim_sums:
        if dim_counts[k] > 0:
            dim_avgs[k] = round(dim_sums[k] / dim_counts[k], 1)
        else:
            dim_avgs[k] = 50.0

    overall_score = dim_avgs.get("total", 0.0)
    tier_info = get_tier(overall_score)

    # 找出最差维度（排除 total，只看四个子维度）
    sub_dims = ["braking", "mid_speed", "throttle", "racing_line"]
    worst_dim = None
    worst_score = 101.0
    for d in sub_dims:
        score = dim_avgs.get(d, 101.0)
        if score < worst_score:
            worst_score = score
            worst_dim = d

    # 生成吐槽
    roast = ""
    if worst_dim and worst_score < 60.0:
        roast_candidates = DIMENSION_ROASTS.get(worst_dim, [])
        # 找出现次数最多的 flag 对应的吐槽
        best_roast = None
        best_count = -1
        for cand in roast_candidates:
            count = flag_counts.get(cand["flag"], 0)
            if count > best_count:
                best_count = count
                best_roast = cand["text"]
        if best_roast and best_count > 0:
            roast = best_roast
        elif roast_candidates:
            # 即使没有 flag，如果分数很低也给一个通用吐槽
            roast = roast_candidates[0]["text"]

    # 组装文案
    summary = tier_info["text"]
    full_feedback = summary
    if roast:
        full_feedback += f" 尤其是{worst_dim}方面，{roast}"

    return {
        "tier": tier_info["key"],
        "title": tier_info["title"],
        "summary": summary,
        "roast": roast,
        "full_text": full_feedback,
        "overall_score": overall_score,
        "dimension_scores": {k: v for k, v in dim_avgs.items() if k != "total"},
        "worst_dimension": worst_dim,
        "worst_dimension_score": worst_score,
        "flag_summary": flag_counts,
        "corner_count": len(corner_results),
    }


def generate_corner_feedback(corner_result: Dict[str, Any]) -> str:
    """为单个弯道生成一句话反馈"""
    scores = corner_result.get("scores", {})
    total = scores.get("total", 0)
    ai_class = corner_result.get("ai_class", "Unknown")
    flags = corner_result.get("flags", {})

    if total >= 90:
        return "这个弯过得像外星人附体，教科书级别的操作。"
    elif total >= 75:
        return "不错的过弯，但在极限边缘的把控上还能更细腻。"
    elif total >= 60:
        return "勉强及格，你的轮胎正在写投诉信。"
    else:
        # 找具体槽点
        if flags.get("brake_too_early"):
            return "刹车太早了，弯心还没到你就已经快停下来了。"
        elif flags.get("brake_too_late_or_lockup"):
            return "刹车太晚！你是想用前杠把弯心铲平吗？"
        elif flags.get("throttle_too_early_full"):
            return "出弯油门给太猛，后轮都快和你闹离婚了。"
        elif flags.get("missed_apex"):
            return "完美错过弯心，你是故意绕远路省油吗？"
        elif flags.get("over_slow"):
            return "弯心速度堪比老头乐，你到底在怕什么？"
        else:
            return "这个弯过得一言难尽，建议回去多练 50 圈。"
