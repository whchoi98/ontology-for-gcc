from data.synthetic.seeds import inject_pm_m_92ron_pattern, inject_diesel_to_premium_transition


def test_pm_m_pattern_for_250():
    cohort = [f'la-{i:06d}' for i in range(50_000)]
    txs = inject_pm_m_92ron_pattern(cohort, target=250)
    cust_ids = {t.cust_id for t in txs}
    assert len(cust_ids) == 250
    # 각 customer가 같은 day에 premium + regular 거래 보유
    by_cust_day = {}
    for t in txs:
        key = (t.cust_id, t.ts[:10])
        by_cust_day.setdefault(key, set()).add(t.fuel_grade)
    pm_m_days = sum(1 for grades in by_cust_day.values() if {'premium', 'regular'} <= grades)
    assert pm_m_days >= 250 * 8 * 0.9   # 250명 × 8주 × 90% 이상


def test_diesel_to_premium_250():
    cohort = [f'la-{i:06d}' for i in range(50_000)]
    txs = inject_diesel_to_premium_transition(cohort, target=250)
    by_cust = {}
    for t in txs:
        by_cust.setdefault(t.cust_id, []).append(t)
    assert len(by_cust) == 250
    # 각 cust: 2025년에 모두 diesel, 2026년에 모두 premium
    for cust, ts in by_cust.items():
        d2025 = [t for t in ts if t.ts.startswith('2025')]
        p2026 = [t for t in ts if t.ts.startswith('2026')]
        assert all(t.fuel_grade == 'diesel' for t in d2025)
        assert all(t.fuel_grade == 'premium' for t in p2026)
