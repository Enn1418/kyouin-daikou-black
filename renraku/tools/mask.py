#!/usr/bin/env python3
"""生ログの実名を出席番号に置き換える（AIに渡す前の下ごしらえ）。

    00_raw.md（実名あり・ローカルのみ）
        ↓ このスクリプト（AIは介在しない）
    01_masked.md（#1〜#7 のみ。AIが読むのはこちら）

使い方:
    python3 tools/mask.py                          # 今日の記録を変換
    python3 tools/mask.py records/2026-08-11       # 日付を指定
    python3 tools/mask.py --roster sample/roster.csv sample/records/2026-08-11
"""

import argparse
import datetime
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import roster as roster_mod

BASE = Path(__file__).resolve().parent.parent


def mask_text(text, children):
    """実名を #番号 に置換し、(変換後テキスト, 登場した番号) を返す。"""
    found = set()
    for alias, number in roster_mod.all_aliases_sorted(children):
        if alias in text:
            text = text.replace(alias, f"#{number}")
            found.add(number)
    # 「#1さん」「#1くん」などの敬称は番号に吸収させ、表記を揃える
    text = re.sub(r"(#\d+)\s*(さん|くん|君|ちゃん|さま|様)", r"\1", text)
    # 「#1#1」のような二重置換を畳む
    text = re.sub(r"(#\d+)\1+", r"\1", text)
    return text, found


def unmatched_lines(text):
    """児童が特定できなかった記録行を返す（書き漏らしの発見用）。"""
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)   # 書き方メモは対象外
    out = []
    for line in text.splitlines():
        stripped = line.strip()
        # 記録行は「- 」で始まる。コメント終端の「-->」を拾わないよう空白を必須にする
        if stripped.startswith("- ") and not re.search(r"#\d+", stripped):
            out.append(stripped)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("day_dir", nargs="?", help="records/YYYY-MM-DD（省略時は今日）")
    ap.add_argument("--roster", help="名簿CSVのパス")
    args = ap.parse_args()

    if args.day_dir:
        day_dir = Path(args.day_dir)
    else:
        today = datetime.date.today().isoformat()
        day_dir = BASE / "records" / today

    raw = day_dir / "00_raw.md"
    if not raw.exists():
        sys.exit(f"生ログがありません: {raw}\n先に python3 tools/new_day.py を実行してください。")

    children = roster_mod.load(args.roster)
    masked, found = mask_text(raw.read_text(encoding="utf-8"), children)

    out = day_dir / "01_masked.md"
    out.write_text(masked, encoding="utf-8")

    print(f"✅ {out}")
    print(f"   記録があった児童: {'、'.join(f'{n}番' for n in sorted(found)) or 'なし'}")

    missing = sorted(set(children) - found)
    if missing:
        print(f"   記録がなかった児童: {'、'.join(f'{n}番' for n in missing)}")

    orphans = unmatched_lines(masked)
    if orphans:
        print(f"\n   ⚠ 児童を特定できなかった記録が {len(orphans)} 件あります:")
        for line in orphans:
            print(f"     {line}")
        print("     → 名前の言い忘れか、表記ゆれの登録漏れです。")


if __name__ == "__main__":
    main()
