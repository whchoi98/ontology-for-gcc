"""KOSIS·GS IR 통계 분포 + deterministic 시드 PRNG."""
from __future__ import annotations
import random
import hashlib

# KOSIS·GS 공개 IR 기반 분포 (spec §5.2)
AGE_DIST = {'20': 0.18, '30': 0.28, '40': 0.25, '50': 0.18, '60': 0.11}
GENDER_DIST = {'M': 0.61, 'F': 0.39}  # GSC 회원 통계
SIDO_DIST = {'서울': 0.20, '경기': 0.25, '인천': 0.06, '부산': 0.07,
             '대구': 0.05, '대전': 0.03, '세종': 0.01, '광주': 0.03,
             '울산': 0.03, '경북': 0.05, '경남': 0.06, '전북': 0.04,
             '전남': 0.04, '충북': 0.03, '충남': 0.04, '강원': 0.03, '제주': 0.02}
FUEL_DIST = {'regular': 0.50, 'diesel': 0.35, 'premium': 0.08,
             'lpg': 0.05, 'kerosene': 0.02}
SELF_RATE = 0.65
PAYMENT_DIST = {'PLCC': 0.18, 'credit': 0.55, 'smart': 0.12, 'point': 0.10, 'cash': 0.05}
OCCUPATION_DIST = {'OFC': 0.45, 'SVC': 0.20, 'TCH': 0.15, 'STD': 0.05, 'OTH': 0.15}


def seeded_rng(seed: str) -> random.Random:
    """deterministic PRNG — 동일 seed 동일 결과."""
    h = hashlib.sha256(seed.encode()).digest()
    return random.Random(int.from_bytes(h[:8], 'big'))


def weighted_choice(rng: random.Random, dist: dict[str, float]) -> str:
    keys = list(dist.keys())
    weights = list(dist.values())
    return rng.choices(keys, weights=weights, k=1)[0]
