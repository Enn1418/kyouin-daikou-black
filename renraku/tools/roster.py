"""名簿（出席番号 ⇔ 実名）の読み込み。

このモジュールだけが実名を扱います。他の工程は出席番号 (#1〜#7) だけで動きます。
"""

import csv
import sys
from pathlib import Path

DEFAULT_ROSTER = Path(__file__).resolve().parent.parent / "roster.private.csv"


class Child:
    def __init__(self, number, full_name, call_name, aliases):
        self.number = number          # 出席番号 (int)
        self.full_name = full_name    # 氏名（印刷・照合用。AIには渡さない）
        self.call_name = call_name    # 手紙での呼び名（例: たろうさん）
        self.aliases = aliases        # 音声認識の表記ゆれを含む照合語のリスト

    def __repr__(self):
        return f"<Child {self.number}>"


def load(path=None):
    """名簿を読み込んで {出席番号: Child} を返す。"""
    path = Path(path) if path else DEFAULT_ROSTER
    if not path.exists():
        sys.exit(
            f"名簿が見つかりません: {path}\n"
            f"roster.example.csv をコピーして roster.private.csv を作ってください。"
        )

    children = {}
    with open(path, encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            if not row.get("出席番号", "").strip():
                continue
            number = int(row["出席番号"].strip())
            full_name = row["氏名"].strip()
            call_name = row["手紙での呼び名"].strip()

            # 照合語: 氏名、空白を詰めた氏名、姓、名、呼び名、表記ゆれ
            aliases = {full_name, full_name.replace(" ", "").replace("　", ""), call_name}
            parts = full_name.replace("　", " ").split()
            aliases.update(p for p in parts if len(p) >= 2)
            aliases.update(
                a.strip() for a in row.get("表記ゆれ", "").split(";") if a.strip()
            )
            children[number] = Child(number, full_name, call_name, sorted(aliases))

    if not children:
        sys.exit(f"名簿に児童が1人も登録されていません: {path}")

    if "example" in path.name:
        print(
            f"  ⚠ 見本ファイル ({path.name}) を使っています。\n"
            f"    このファイルは Git で公開されます。実名は roster.private.csv に書いてください。",
            file=sys.stderr,
        )

    _warn_ambiguous(children)
    return children


def _warn_ambiguous(children):
    """ある児童の照合語が別の児童の照合語に含まれる場合に警告する。

    例: 「ゆう」と「ゆうた」が別の児童にいると、誤って振り分けられます。
    """
    entries = [(c.number, a) for c in children.values() for a in c.aliases]
    for num_a, alias_a in entries:
        for num_b, alias_b in entries:
            if num_a != num_b and alias_a in alias_b:
                print(
                    f"  ⚠ 照合語が重複しています: {num_a}番の「{alias_a}」が"
                    f"{num_b}番の「{alias_b}」に含まれます。"
                    f"表記ゆれ列を見直してください。",
                    file=sys.stderr,
                )


def all_aliases_sorted(children):
    """全児童の照合語を「長い順」で返す。長い語から置換しないと部分一致で壊れる。"""
    pairs = [(alias, c.number) for c in children.values() for alias in c.aliases]
    return sorted(pairs, key=lambda p: -len(p[0]))
