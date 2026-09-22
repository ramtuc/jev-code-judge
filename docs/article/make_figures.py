"""Qiita 記事用の画像を生成するスクリプト。

1. assets/*.png（1440x1544 の全画面スクリーンショット）から必要なパネルだけを
   Pillow で切り出して assets/crop/ に保存する（原本は変更しない）
2. data/*.json の実測値から要約図 assets/fig-*.png を matplotlib で描く

実行:
    py -3.10 docs/article/make_figures.py          # 両方
    py -3.10 docs/article/make_figures.py crop     # 切り出しだけ
    py -3.10 docs/article/make_figures.py fig      # 要約図だけ

必要なもの: Pillow, matplotlib（無ければ `uv run --with matplotlib --with pillow`）
数値は data/ の JSON から読む。本文の表と食い違ったら data/ が正。
"""

from __future__ import annotations

import json
import statistics as st
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ASSETS = HERE / "assets"
CROP = ASSETS / "crop"
DATA = HERE / "data"

# 全画面スクショ内のパネル境界（1440x1544・実測）
#   外枠 x=34..1405 / 縦の仕切り x=957
#   y=272 パネル上端 / 784 APPLY MUTATION 上端 / 1137 EXPERIMENT RUNS 上端 / 1469 下端
BOX = {
    "overview": (34, 272, 1406, 786),  # CODE UNDER TEST + VERDICT
    "verdict": (957, 272, 1406, 786),  # VERDICT パネルのみ
    "code": (34, 272, 958, 786),  # CODE UNDER TEST のみ
    "mutations": (34, 784, 958, 1138),  # APPLY MUTATION のみ
    "runs3": (34, 1137, 958, 1345),  # EXPERIMENT RUNS（3 行）
    "runs6": (34, 1137, 958, 1470),  # EXPERIMENT RUNS（6 行）
}

# (元ファイル, 切り出し種別, 出力名)
CROPS = [
    ("01-clean.png", "overview", "01-overview-clean.png"),
    ("01-clean.png", "verdict", "01-verdict-clean.png"),
    ("02-isolated-three-trials.png", "runs3", "02-runs-any-x3.png"),
    ("02-isolated-three-trials.png", "verdict", "02-verdict-any-x3.png"),
    ("03-cumulative-midpoint.png", "mutations", "03-mutation-panel.png"),
    ("04-cumulative-reject.png", "code", "04-code-all-mutations.png"),
    ("04-cumulative-reject.png", "verdict", "04-verdict-reject-100.png"),
    ("05-isolated-all-mutations.png", "runs6", "05-runs-isolated.png"),
    ("06-perspective-security.png", "verdict", "06-verdict-security.png"),
    ("06-perspective-maintainability.png", "verdict", "06-verdict-maintainability.png"),
]


def make_crops() -> None:
    from PIL import Image

    CROP.mkdir(exist_ok=True)
    for src, kind, dst in CROPS:
        im = Image.open(ASSETS / src)
        if im.size != (1440, 1544):
            raise SystemExit(f"{src}: expected 1440x1544, got {im.size}")
        out = im.crop(BOX[kind])
        out.save(CROP / dst, optimize=True)
        print(f"crop {src} [{kind}] -> crop/{dst} {out.size}")

    # Clean と全部壊した状態の VERDICT を左右に並べた比較画像
    left = Image.open(CROP / "01-verdict-clean.png")
    right = Image.open(CROP / "04-verdict-reject-100.png")
    gap = 12
    pair = Image.new("RGB", (left.width + gap + right.width, left.height), (14, 24, 20))
    pair.paste(left, (0, 0))
    pair.paste(right, (left.width + gap, 0))
    pair.save(CROP / "verdict-clean-vs-all.png", optimize=True)
    print(f"crop pair -> crop/verdict-clean-vs-all.png {pair.size}")


# ---------------------------------------------------------------- data ----


def load(name: str):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def rejects(rows):
    return [r["scores"]["reject"] for r in rows]


def verdicts(rows):
    return [r["verdict"] for r in rows]


# ------------------------------------------------------------- figures ----

SURFACE = "#fcfcfb"
INK = "#0b0b0b"
INK2 = "#52514e"
GRID = "#e6e5e1"
C_CUM = "#2a78d6"  # 累積（1 回）
C_ISO = "#eb6834"  # 独立（3 回）
C_CEIL = "#d03b3b"  # 天井の帯（status critical）
LABELS = {
    "any-type": "any",
    "remove-validation": "検証削除",
    "swallow-exception": "例外握り潰し",
    "sql-concat": "SQL 結合",
    "add-eval": "eval()",
}
ORDER = ["any-type", "remove-validation", "swallow-exception", "sql-concat", "add-eval"]


def setup_matplotlib():
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    plt.rcParams.update(
        {
            "font.family": ["Yu Gothic", "Meiryo", "BIZ UDGothic", "sans-serif"],
            "font.size": 11,
            "axes.edgecolor": GRID,
            "axes.labelcolor": INK2,
            "xtick.color": INK2,
            "ytick.color": INK2,
            "text.color": INK,
            "axes.spines.top": False,
            "axes.spines.right": False,
            "figure.facecolor": SURFACE,
            "axes.facecolor": SURFACE,
            "savefig.facecolor": SURFACE,
        }
    )
    return plt


def marker_for(verdict: str) -> dict:
    # 判定は色ではなく塗りで区別する（REJECT = 塗り / CAUTION = 白抜き）
    if verdict == "REJECT":
        return {"fillstyle": "full"}
    return {"fillstyle": "none"}


def draw_ceiling(ax, xmin, xmax):
    ax.axhspan(97, 103, color=C_CEIL, alpha=0.08, lw=0)
    ax.axhline(100, color=C_CEIL, alpha=0.35, lw=1)
    ax.text(xmax, 101.5, "天井 100（差が消える）", ha="right", va="bottom", fontsize=9, color=INK2)


def draw_boundary(ax, xmin, xmax, side="right"):
    ax.axhline(50, color=INK2, alpha=0.5, lw=1)
    if side == "right":
        ax.text(xmax, 51, "CAUTION / REJECT の分かれ目（≈50）", ha="right", va="bottom", fontsize=9, color=INK2)
    else:
        ax.text(xmin + 0.05, 51, "CAUTION / REJECT の分かれ目（≈50）", ha="left", va="bottom", fontsize=9, color=INK2)


def fig_scores(plt) -> None:
    """図 1: 累積（1 回）と独立（3 回）の REJECT スコア + 境界ズーム。"""
    cum = load("cumulative-boundary.json")
    iso = load("isolated-three-trials.json") + load("isolated-remaining-mutations.json")
    rep = load("repair-experiment.json")

    fig, (ax, ax2) = plt.subplots(1, 2, figsize=(11, 4.6), gridspec_kw={"width_ratios": [3, 2]})
    fig.subplots_adjust(left=0.06, right=0.98, bottom=0.26, top=0.82, wspace=0.28)

    # --- 左: Mutation ごとの REJECT スコア
    x = list(range(len(ORDER)))
    ax.set_xlim(-0.6, len(ORDER) - 0.4)
    ax.set_ylim(0, 108)
    ax.set_yticks([0, 25, 50, 75, 100])
    ax.grid(axis="y", color=GRID, lw=1)
    ax.set_axisbelow(True)
    draw_ceiling(ax, -0.6, len(ORDER) - 0.45)
    draw_boundary(ax, -0.6, len(ORDER) - 0.45)

    # Clean の基準線（単発 42・スクショ 01）
    ax.axhline(42, color=INK2, alpha=0.35, lw=1, ls=(0, (3, 3)))
    ax.text(len(ORDER) - 0.45, 41, "Clean（壊す前・1 回）42", ha="right", va="top", fontsize=9, color=INK2)

    # 累積（1 回ずつ・折れ線）
    cum_by = {r["mutation"]: r for r in cum}
    ys = [cum_by[m]["scores"]["reject"] for m in ORDER]
    ax.plot([xi - 0.12 for xi in x], ys, color=C_CUM, lw=2, zorder=3, solid_capstyle="round")
    for xi, m in zip(x, ORDER):
        r = cum_by[m]
        ax.plot(xi - 0.12, r["scores"]["reject"], marker="o", ms=9, color=C_CUM, mew=2, mec=C_CUM, zorder=4, **marker_for(r["verdict"]))

    # 独立（3 回・平均と min–max）
    for xi, m in zip(x, ORDER):
        rows = [r for r in iso if r["mutation"] == m]
        rj = rejects(rows)
        mean = st.mean(rj)
        ax.errorbar(xi + 0.12, mean, yerr=[[mean - min(rj)], [max(rj) - mean]], color=C_ISO, lw=2, capsize=5, capthick=2, zorder=3)
        major = max(set(verdicts(rows)), key=verdicts(rows).count)
        ax.plot(xi + 0.12, mean, marker="s", ms=9, color=C_ISO, mew=2, mec=C_ISO, zorder=4, **marker_for(major))
        if max(rj) < 97:
            ax.text(xi + 0.12, max(rj) + 3, f"{mean:.1f}".rstrip("0").rstrip("."), ha="center", va="bottom", fontsize=9, color=INK)
    for xi, m in zip(x, ORDER):
        v = cum_by[m]["scores"]["reject"]
        if v < 97:
            ax.text(xi - 0.12, v - 4, str(v), ha="center", va="top", fontsize=9, color=INK)

    ax.set_xticks(x)
    ax.set_xticklabels([LABELS[m] for m in ORDER])
    ax.set_ylabel("REJECT スコア")
    ax.set_title("壊し方ごとの REJECT スコア（累積は左から順に積み重ね）", loc="left", fontsize=11, color=INK)

    from matplotlib.lines import Line2D

    handles = [
        Line2D([], [], color=C_CUM, lw=2, marker="o", ms=8, label="累積（各段階 1 回）"),
        Line2D([], [], color=C_ISO, lw=2, marker="s", ms=8, label="独立（Clean に 1 個だけ・3 回の平均と min–max）"),
        Line2D([], [], color=INK2, lw=0, marker="o", ms=8, fillstyle="full", label="塗り = REJECT 判定"),
        Line2D([], [], color=INK2, lw=0, marker="o", ms=8, fillstyle="none", mew=1.5, label="白抜き = CAUTION 判定"),
    ]
    fig.legend(handles=handles, loc="lower left", bbox_to_anchor=(0.06, 0.01), ncol=2, frameon=False, fontsize=9, handletextpad=0.6, columnspacing=1.5)

    # --- 右: 境界ズーム（同じ数点差でラベルが割れる）
    groups = [
        ("any だけ\n（独立 ×3）", [r for r in iso if r["mutation"] == "any-type"]),
        ("SQL を直した直後\n（修正実験 step 2）", [r for r in rep if r["step"] == 2]),
        ("入力検証を戻した\n（修正実験 step 4）", [r for r in rep if r["step"] == 4]),
    ]
    ax2.set_xlim(-0.6, len(groups) - 0.4)
    ax2.set_ylim(44, 56)
    ax2.set_yticks([44, 46, 48, 50, 52, 54, 56])
    ax2.grid(axis="y", color=GRID, lw=1)
    ax2.set_axisbelow(True)
    ax2.axhline(50, color=INK2, alpha=0.5, lw=1)
    for gi, (name, rows) in enumerate(groups):
        offs = [-0.18, 0.0, 0.18]
        for off, r in zip(offs, rows):
            v = r["scores"]["reject"]
            ax2.plot(gi + off, v, marker="o", ms=11, color=INK2, mew=2, mec=INK2, zorder=4, **marker_for(r["verdict"]))
            ax2.text(gi + off, v + 0.8, f"{v}", ha="center", va="bottom", fontsize=9, color=INK)
    ax2.set_xticks(range(len(groups)))
    ax2.set_xticklabels([g[0] for g in groups], fontsize=9)
    ax2.set_title("境界付近のズーム：数点差でラベルが割れる", loc="left", fontsize=11, color=INK)
    ax2.text(-0.55, 55.6, "塗り = REJECT / 白抜き = CAUTION（数字は REJECT スコア）", ha="left", va="top", fontsize=8.5, color=INK2)
    ax2.text(len(groups) - 0.45, 50.15, "≈50", ha="right", va="bottom", fontsize=8.5, color=INK2)

    fig.suptitle("Jev の REJECT スコア：累積 vs 独立、そして境界（production-readiness-v1・2026-09-22）", x=0.06, ha="left", fontsize=12, color=INK)
    out = ASSETS / "fig-reject-scores.png"
    fig.savefig(out, dpi=150)
    print("fig ->", out.relative_to(HERE))


def fig_repair(plt) -> None:
    """図 2: 全部壊した状態から 1 つずつ直したときの REJECT スコア。"""
    rep = load("repair-experiment.json")
    steps = sorted({r["step"] for r in rep})
    labels = {
        0: "全部壊れた\n状態",
        1: "eval() を\n削除",
        2: "SQL を\nパラメータ化",
        3: "例外処理を\n復元",
        4: "入力検証を\n復元",
        5: "型を復元\n（= Clean）",
    }
    fig, ax = plt.subplots(figsize=(9, 4.4))
    fig.subplots_adjust(left=0.08, right=0.98, bottom=0.2, top=0.84)
    ax.set_xlim(-0.6, len(steps) - 0.4)
    ax.set_ylim(0, 108)
    ax.set_yticks([0, 25, 50, 75, 100])
    ax.grid(axis="y", color=GRID, lw=1)
    ax.set_axisbelow(True)
    draw_ceiling(ax, -0.6, len(steps) - 0.45)
    draw_boundary(ax, -0.6, len(steps) - 0.45, side="left")

    means = []
    for s in steps:
        rows = [r for r in rep if r["step"] == s]
        rj = rejects(rows)
        means.append(st.mean(rj))
    ax.plot(steps, means, color=C_CUM, lw=2, zorder=2, solid_capstyle="round")
    for s in steps:
        rows = [r for r in rep if r["step"] == s]
        offs = [-0.1, 0.0, 0.1]
        for off, r in zip(offs, rows):
            ax.plot(s + off, r["scores"]["reject"], marker="o", ms=8, color=C_CUM, mew=1.8, mec=C_CUM, zorder=4, **marker_for(r["verdict"]))
        m = means[s]
        if m < 97:
            ax.text(s, min(rejects(rows)) - 4, f"平均 {m:.1f}", ha="center", va="top", fontsize=9, color=INK)

    # 注釈
    ax.annotate("eval() を消しても 100 のまま", xy=(1, 100), xytext=(1.05, 82), fontsize=9, color=INK, arrowprops={"arrowstyle": "-", "color": INK2, "lw": 1}, ha="left")
    ax.annotate("SQL を直した瞬間に 100 → 51", xy=(2, 51), xytext=(2.15, 68), fontsize=9, color=INK, arrowprops={"arrowstyle": "-", "color": INK2, "lw": 1}, ha="left")
    ax.annotate("入力検証を戻すと 38 → 48 に上がる", xy=(4.1, 47), xytext=(4.25, 28), fontsize=9, color=INK, arrowprops={"arrowstyle": "-", "color": INK2, "lw": 1}, ha="center")

    ax.set_xticks(steps)
    ax.set_xticklabels([labels[s] for s in steps], fontsize=9)
    ax.set_ylabel("REJECT スコア")
    ax.set_title("直すと戻るか：各段階 3 回（点 = 各試行、線 = 平均。塗り = REJECT / 白抜き = CAUTION）", loc="left", fontsize=11, color=INK)
    fig.suptitle("修正実験：全部壊した状態から 1 つずつ元に戻す（production-readiness-v1・2026-09-22）", x=0.08, ha="left", fontsize=12, color=INK)
    out = ASSETS / "fig-repair.png"
    fig.savefig(out, dpi=150)
    print("fig ->", out.relative_to(HERE))


def make_figures() -> None:
    plt = setup_matplotlib()
    fig_scores(plt)
    fig_repair(plt)


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    if what in ("all", "crop"):
        make_crops()
    if what in ("all", "fig"):
        make_figures()
