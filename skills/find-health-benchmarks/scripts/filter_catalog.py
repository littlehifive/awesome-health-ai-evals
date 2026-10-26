"""Rank catalog entries for a setting (standard library only).

Example:
    python filter_catalog.py --countries Nigeria --regions AFR --income lower-middle \
        --languages Hausa English --areas maternal_newborn primary_care --users patient_public --top 25

Scores (higher is better): item country match 4, same WHO region 2, same income group 1,
language match 3 (1 if English is the only match, since most entries are English), health area overlap 2, intended user overlap 1, judged scoring
(rubric, expert rating, multi-turn, real users) 1, open data 1, native LMIC items 1.
Entries matching nothing on place, language, area, or user are left out.
"""

import argparse
import csv
from pathlib import Path

CATALOG = Path(__file__).resolve().parent.parent / "references" / "catalog.csv"
JUDGED = {"rubric_llm_judge", "expert_human_rating", "simulated_multi_turn", "real_user_data"}


def split(v: str) -> set[str]:
    return {x.strip().lower() for x in v.split(";") if x.strip()}


def main() -> None:
    p = argparse.ArgumentParser()
    for name in ["countries", "regions", "income", "languages", "areas", "users"]:
        p.add_argument(f"--{name}", nargs="*", default=[])
    p.add_argument("--top", type=int, default=25)
    a = p.parse_args()
    want = {k: {x.lower() for x in getattr(a, k)} for k in ["countries", "regions", "income", "languages", "areas", "users"]}

    rows = []
    for r in csv.DictReader(CATALOG.open()):
        hits = {
            "country": want["countries"] & split(r["item_countries"]),
            "region": want["regions"] & split(r["who_regions"]),
            "income": want["income"] & split(r["income_groups"]),
            "language": want["languages"] & split(r["item_languages"]),
            "area": want["areas"] & split(r["health_areas"]),
            "user": want["users"] & split(r["intended_users"]),
        }
        if not (hits["country"] or hits["region"] or hits["language"] or hits["area"] or hits["user"]):
            continue
        score = (4 * bool(hits["country"]) + 2 * bool(hits["region"]) + bool(hits["income"])
                 + (3 if hits["language"] - {"english"} else bool(hits["language"]))
                 + 2 * bool(hits["area"]) + bool(hits["user"])
                 + bool(JUDGED & split(r["eval_methods"])) + (r["open_data"] == "open")
                 + (r["item_origin"] == "native LMIC"))
        rows.append((score, r, [k for k, v in hits.items() if v]))
    rows.sort(key=lambda x: -x[0])
    for score, r, why in rows[:a.top]:
        print(f"{score:2d}  {r['id']}  |  {r['name']} ({r['year']})  |  matches: {', '.join(why)}  |  "
              f"{r['item_languages']}  |  {r['item_countries']}  |  {r['item_origin']}  |  {r['eval_methods']}  |  "
              f"{r['open_data']}  |  constructs: {r['constructs'] or 'none recorded'}  |  confidence {r['confidence']}")
    print(f"\n{len(rows)} entries matched at least one criterion; showing {min(a.top, len(rows))}.")


if __name__ == "__main__":
    main()
