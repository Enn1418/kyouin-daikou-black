#!/usr/bin/env python3
"""手紙(Markdown) を、感熱紙50mm幅(384ドット)の印刷用画像に変換する。

    letters/3.md（#3 のまま） → print/3.png（「じろうさん」に復元済み）

この工程で初めて実名（呼び名）が現れます。実名の復元はローカルのみで行われ、
AIには渡りません。

使い方:
    python3 tools/render_letter.py records/2026-08-11/letters/3.md
    python3 tools/render_letter.py --all records/2026-08-11
    python3 tools/render_letter.py --all --roster sample/roster.csv sample/records/2026-08-11

必要なもの:
    pip install Pillow
"""

import argparse
import datetime
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
import roster as roster_mod

# --- 印刷設定（実物を見ながらここだけ調整する） ---------------------------
WIDTH = 384          # 印字幅48mm = 384ドット。50mm級のプリンタはほぼこの値
MARGIN = 14          # 左右の余白(px)
BODY_SIZE = 26       # 本文の文字サイズ。小さすぎると読めない
HEAD_SIZE = 18       # 日付・宛名の文字サイズ
LINE_GAP = 11        # 行間(px)
TOP_PAD = 14
BOTTOM_PAD = 28      # 手で切る余白。カッター無し機では多めに
THRESHOLD = 165      # 白黒2値化のしきい値。印字がかすれるなら上げる
# -------------------------------------------------------------------------

WEEKDAYS = "月火水木金土日"

# 行頭に来てはいけない文字（禁則処理）
NO_LINE_START = "、。，．・：；！？」』）］｝〕〉》”’ー〜々ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ!?,.)]}"

FONT_CANDIDATES = [
    # Linux
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJKjp-Regular.otf",
    "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf",
    # macOS
    "/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc",
    "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc",
    "/Library/Fonts/Arial Unicode.ttf",
    # Windows
    "C:/Windows/Fonts/YuGothM.ttc",
    "C:/Windows/Fonts/meiryo.ttc",
    "C:/Windows/Fonts/msgothic.ttc",
]


def find_font():
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return path
    sys.exit(
        "日本語フォントが見つかりませんでした。\n"
        "FONT_CANDIDATES に手元のフォントのパスを追加してください。\n"
        "（Windowsは C:/Windows/Fonts/、macOSは /System/Library/Fonts/ にあります）"
    )


def clean(text):
    """印刷しない要素を取り除く。"""
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)   # 根拠コメント
    # 見出し記号。「#1」を壊さないよう、# の後に空白がある場合だけ落とす
    text = re.sub(r"^#{1,6}[ \t]+", "", text, flags=re.M)
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)         # 強調記号
    return text.strip()


def unmask(text, children, target):
    """#番号 を実名に戻す。他の児童は「おともだち」にして名前を出さない。"""
    def repl(m):
        num = int(m.group(1))
        if num == target:
            return children[num].call_name
        return "おともだち"

    return re.sub(r"#(\d+)", repl, text)


def wrap(text, font, max_width):
    """文字幅を実測して折り返す（全角・半角混在に対応）。"""
    lines = []
    current = ""
    for ch in text:
        if ch == "\n":
            lines.append(current)
            current = ""
            continue
        if not current or font.getlength(current + ch) <= max_width:
            current += ch
            continue
        if ch in NO_LINE_START:
            current += ch          # 行頭禁則: はみ出しても現在行に押し込む
            lines.append(current)
            current = ""
        else:
            lines.append(current)
            current = ch
    if current:
        lines.append(current)
    return lines


def render(letter_path, children, out_path=None):
    letter_path = Path(letter_path)
    target = int(letter_path.stem)
    if target not in children:
        sys.exit(f"名簿に {target} 番がいません: {letter_path}")

    day = letter_path.parent.parent.name          # records/YYYY-MM-DD/letters/3.md
    try:
        date = datetime.date.fromisoformat(day)
        header_date = f"{date.month}月{date.day}日({WEEKDAYS[date.weekday()]})"
    except ValueError:
        header_date = day

    body = unmask(clean(letter_path.read_text(encoding="utf-8")), children, target)
    if not body:
        sys.exit(f"本文が空です: {letter_path}")

    font_path = find_font()
    body_font = ImageFont.truetype(font_path, BODY_SIZE)
    head_font = ImageFont.truetype(font_path, HEAD_SIZE)

    lines = wrap(body, body_font, WIDTH - MARGIN * 2)
    height = TOP_PAD + HEAD_SIZE + 12 + len(lines) * (BODY_SIZE + LINE_GAP) + BOTTOM_PAD

    img = Image.new("L", (WIDTH, height), 255)
    draw = ImageDraw.Draw(img)

    y = TOP_PAD
    draw.text((MARGIN, y), f"{header_date}  {children[target].call_name}",
              font=head_font, fill=0)
    y += HEAD_SIZE + 6
    draw.line((MARGIN, y, WIDTH - MARGIN, y), fill=0, width=1)
    y += 6

    for line in lines:
        draw.text((MARGIN, y), line, font=body_font, fill=0)
        y += BODY_SIZE + LINE_GAP

    # 感熱ヘッドは中間調を出せないので、ディザリングせず単純に2値化する
    img = img.point(lambda p: 0 if p < THRESHOLD else 255).convert("1")

    if out_path is None:
        out_path = letter_path.parent.parent / "print" / f"{target}.png"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path)
    print(f"✅ {out_path}  ({WIDTH}x{height}px / {len(lines)}行 / 本文{len(body)}字)")
    return out_path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path", help="手紙のmd、または --all のときは records/YYYY-MM-DD")
    ap.add_argument("--all", action="store_true", help="その日の手紙をまとめて変換")
    ap.add_argument("--roster", help="名簿CSVのパス")
    args = ap.parse_args()

    children = roster_mod.load(args.roster)

    if args.all:
        letters = sorted(
            Path(args.path).glob("letters/*.md"), key=lambda p: int(p.stem)
        )
        if not letters:
            sys.exit(f"手紙が見つかりません: {args.path}/letters/*.md")
        for letter in letters:
            render(letter, children)
    else:
        render(args.path, children)


if __name__ == "__main__":
    main()
