import pytest
from data.schemas import FuelTransaction
from data.synthetic.lookalike import expand_to_lookalike


def test_expand_to_50k():
    seed = [FuelTransaction(tx_id=f't-{i}', cust_id=f'r{i%5}',
            ts='2024-01-01T00:00:00+09:00', store_cd='S001', fuel_grade='regular',
            qty_l=30.0, unit_price=1700, amount=51000, payment_type='credit')
            for i in range(50)]
    customers, txs = expand_to_lookalike(seed, target_count=1000)
    assert len(customers) == 1000
    assert all(c.data_depth == 'lookalike-syn' for c in customers)
    assert len(txs) > 1000   # 평균 10 tx/customer
