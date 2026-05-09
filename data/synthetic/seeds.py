"""시그니처 패턴 시드 식재:
- PM+M 92 RON 혼유: 같은 day·같은 store_cd에 premium + regular 거래 (1:1~3:1) — 250명
- 디젤→고급 전환: 1년 디젤 → 최근 3개월 고급 - 250명
- 룩어라이크 시드: F 시나리오용 — 1,000명
"""
from __future__ import annotations
from data.schemas import FuelTransaction
from data.synthetic._common import seeded_rng


def inject_pm_m_92ron_pattern(
    cohort_ids: list[str],
    target: int = 250,
) -> list[FuelTransaction]:
    """선택된 250명에 PM+M 같은 day·같은 site 거래 추가."""
    chosen = cohort_ids[:target]
    out: list[FuelTransaction] = []
    for cust in chosen:
        rng = seeded_rng(f'pm-m:{cust}')
        for week in range(8):  # 8주
            store = f'S{rng.randint(1,100):04d}'
            year = 2026
            month = rng.randint(1, 5)
            day = rng.randint(1, 28)
            base_ts = f'{year:04d}-{month:02d}-{day:02d}T'
            ratio = rng.choice([(1, 1), (1, 2), (1, 3)])
            # premium
            qty_p = round(rng.uniform(15, 30), 1)
            out.append(FuelTransaction(
                tx_id=f'pm-{cust}-{week}-p',
                cust_id=cust, ts=f'{base_ts}{rng.randint(8,18):02d}:00:00+09:00',
                store_cd=store, fuel_grade='premium',
                qty_l=qty_p, unit_price=2000, amount=int(qty_p * 2000),
                payment_type='PLCC',
            ))
            # mogas (regular) — 같은 day·site
            qty_m = round(qty_p * ratio[1] / ratio[0], 1)
            out.append(FuelTransaction(
                tx_id=f'pm-{cust}-{week}-m',
                cust_id=cust, ts=f'{base_ts}{rng.randint(8,18):02d}:30:00+09:00',
                store_cd=store, fuel_grade='regular',
                qty_l=qty_m, unit_price=1700, amount=int(qty_m * 1700),
                payment_type='PLCC',
            ))
    return out


def inject_diesel_to_premium_transition(
    cohort_ids: list[str],
    target: int = 250,
) -> list[FuelTransaction]:
    """1년치 디젤 거래 후 최근 3개월에 premium만 — 유종 전환 패턴."""
    chosen = cohort_ids[:target]
    out: list[FuelTransaction] = []
    for cust in chosen:
        rng = seeded_rng(f'd2p:{cust}')
        # 2025년 1년치 디젤
        for m in range(1, 13):
            for _ in range(rng.randint(2, 4)):
                day = rng.randint(1, 28)
                qty = round(rng.uniform(40, 70), 1)
                out.append(FuelTransaction(
                    tx_id=f'd2p-d-{cust}-{m}-{day}',
                    cust_id=cust, ts=f'2025-{m:02d}-{day:02d}T08:00:00+09:00',
                    store_cd=f'S{rng.randint(1,100):04d}', fuel_grade='diesel',
                    qty_l=qty, unit_price=1600, amount=int(qty * 1600),
                    payment_type='credit',
                ))
        # 2026년 3~5월 premium만
        for m in (3, 4, 5):
            for _ in range(rng.randint(3, 5)):
                day = rng.randint(1, 28)
                qty = round(rng.uniform(20, 35), 1)
                out.append(FuelTransaction(
                    tx_id=f'd2p-p-{cust}-{m}-{day}',
                    cust_id=cust, ts=f'2026-{m:02d}-{day:02d}T18:00:00+09:00',
                    store_cd=f'S{rng.randint(1,100):04d}', fuel_grade='premium',
                    qty_l=qty, unit_price=2000, amount=int(qty * 2000),
                    payment_type='PLCC',
                ))
    return out
