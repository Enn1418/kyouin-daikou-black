#!/usr/bin/env python3
"""その場の気づきを1行、今日の生ログに追記する（キーボード入力用）。

    python3 tools/add.py "たろうさん、給食で自分からおかわりって言えた"

その日のフォルダが無ければ自動で作ります。時刻は自動で付きます。
音声で録った内容も、文字起こしをコピーしてこのコマンドに渡せます。
"""

import datetime
import subprocess
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent


def main():
    text = " ".join(sys.argv[1:]).strip()
    if not text:
        sys.exit('記録する内容を渡してください:\n  python3 tools/add.py "たろうさん、…"')

    now = datetime.datetime.now()
    day = now.date().isoformat()
    raw = BASE / "records" / day / "00_raw.md"

    if not raw.exists():
        subprocess.run([sys.executable, str(BASE / "tools" / "new_day.py"), day], check=True)

    with open(raw, "a", encoding="utf-8") as f:
        f.write(f"- {now:%H:%M} {text}\n")

    print(f"✅ {now:%H:%M} {text}")


if __name__ == "__main__":
    main()
