#!/usr/bin/env python3
"""その日のフォルダを作る。

    python3 tools/new_day.py              # 今日
    python3 tools/new_day.py 2026-08-12   # 日付を指定
"""

import datetime
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
WEEKDAYS = "月火水木金土日"


def main():
    day = sys.argv[1] if len(sys.argv) > 1 else datetime.date.today().isoformat()
    date = datetime.date.fromisoformat(day)

    day_dir = BASE / "records" / day
    (day_dir / "letters").mkdir(parents=True, exist_ok=True)
    (day_dir / "print").mkdir(parents=True, exist_ok=True)

    raw = day_dir / "00_raw.md"
    if raw.exists():
        print(f"すでにあります: {raw}")
        return

    template = (BASE / "templates" / "00_raw.md").read_text(encoding="utf-8")
    raw.write_text(
        template.format(date=day, weekday=WEEKDAYS[date.weekday()]), encoding="utf-8"
    )
    print(f"✅ {raw}")


if __name__ == "__main__":
    main()
