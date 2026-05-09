"""실 33명 deep-history 매출 패턴을 seed로 ~5만명 lookalike-syn 확장."""
from __future__ import annotations
from collections import defaultdict
from data.schemas import Customer, FuelTransaction
from data.synthetic._common import seeded_rng, weighted_choice, FUEL_DIST, SIDO_DIST
from data.synthetic.customer import enrich_customer_attributes


def expand_to_lookalike(
    real_txs: list[FuelTransaction],
    target_count: int = 50_000,
) -> tuple[list[Customer], list[FuelTransaction]]:
    """실 33명의 거래 분포를 학습 → target_count명 합성."""
    # 1) seed별 평균 거래수·연료 분포·금액 분포 추출
    by_cust: dict[str, list[FuelTransaction]] = defaultdict(list)
    for t in real_txs:
        by_cust[t.cust_id].append(t)
    avg_tx_per_cust = sum(len(v) for v in by_cust.values()) / max(len(by_cust), 1)

    new_customers: list[Customer] = []
    new_txs: list[FuelTransaction] = []
    rng_global = seeded_rng('lookalike-global')

    for i in range(target_count):
        new_cust_id = f'la-{i:06d}'
        # 한 seed cohort에 매핑
        seed_id = list(by_cust.keys())[i % len(by_cust)] if by_cust else None
        seed_txs = by_cust.get(seed_id, []) if seed_id else []

        c = enrich_customer_attributes(new_cust_id, 'lookalike-syn')
        new_customers.append(c)

        # 거래 합성: seed의 평균 ± 30%, 분포는 KOSIS
        # 캡: env LOOKALIKE_TX_CAP (default 20) — 50K 고객 × 20 ≈ 1M FuelTransaction 메모리 안전선
        import os as _os
        tx_cap = int(_os.environ.get('LOOKALIKE_TX_CAP', '20'))
        rng = seeded_rng(f'lookalike-tx:{new_cust_id}')
        n_tx = max(1, int(rng.gauss(avg_tx_per_cust, avg_tx_per_cust * 0.3)))
        for j in range(min(n_tx, tx_cap)):
            grade = weighted_choice(rng, FUEL_DIST)
            qty = round(rng.uniform(20, 60), 1)
            unit = {'regular': 1700, 'premium': 2000, 'diesel': 1600,
                    'kerosene': 1400, 'lpg': 1100}[grade]
            unit += rng.randint(-50, 50)
            year = 2020 + rng.randint(0, 5)
            month = rng.randint(1, 12)
            day = rng.randint(1, 28)
            ts = f'{year:04d}-{month:02d}-{day:02d}T{rng.randint(0,23):02d}:00:00+09:00'
            new_txs.append(FuelTransaction(
                tx_id=f'la-tx-{i}-{j}',
                cust_id=new_cust_id, ts=ts, store_cd=f'S{rng.randint(1,452):04d}',
                fuel_grade=grade, qty_l=qty, unit_price=unit, amount=int(qty * unit),
                payment_type=weighted_choice(rng, {'PLCC': 0.18, 'credit': 0.55,
                                                    'smart': 0.12, 'point': 0.10, 'cash': 0.05}),
            ))
    return new_customers, new_txs
