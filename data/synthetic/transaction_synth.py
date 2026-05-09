"""coupon-only 484명에게 합성 매출 부여 (deep-history 33명 분포 기반, 6개월치)."""
from __future__ import annotations
from data.schemas import FuelTransaction
from data.synthetic._common import seeded_rng, weighted_choice, FUEL_DIST


def generate_for_coupon_only(
    coupon_only_cust_ids: list[str],
) -> list[FuelTransaction]:
    out: list[FuelTransaction] = []
    for cust in coupon_only_cust_ids:
        rng = seeded_rng(f'syn-tx:{cust}')
        n_tx = rng.randint(2, 30)   # 6개월에 2~30회
        for j in range(n_tx):
            grade = weighted_choice(rng, FUEL_DIST)
            qty = round(rng.uniform(20, 50), 1)
            unit = {'regular': 1700, 'premium': 2000, 'diesel': 1600,
                    'kerosene': 1400, 'lpg': 1100}[grade] + rng.randint(-50, 50)
            month = rng.randint(11, 12) if rng.random() < 0.3 else rng.randint(1, 12)
            day = rng.randint(1, 28)
            hour = rng.randint(7, 21)
            year = 2025 if month >= 11 else 2026
            ts = f'{year:04d}-{month:02d}-{day:02d}T{hour:02d}:00:00+09:00'
            out.append(FuelTransaction(
                tx_id=f'syn-{cust}-{j}', cust_id=cust, ts=ts,
                store_cd=f'S{rng.randint(1,452):04d}', fuel_grade=grade,
                qty_l=qty, unit_price=unit, amount=int(qty * unit),
                payment_type=weighted_choice(rng, {'PLCC': 0.18, 'credit': 0.55,
                                                    'smart': 0.12, 'point': 0.10, 'cash': 0.05}),
            ))
    return out
