import os
import pytest
from pathlib import Path
import glob

RAW = Path(os.environ.get('GCC_RAW_DATA_DIR', './raw_data'))
_matches = glob.glob(str(RAW / '3*.csv'))
_FILE3 = _matches[0] if _matches else str(RAW / '3.cust_deal_cntx_intg_주유매출내역.csv')

pytestmark = pytest.mark.skipif(not _matches, reason='file 3 not present')

from data.real.transaction import load


def test_returns_33_unique_customers():
    txs = load(_FILE3)
    assert len({t.cust_id for t in txs}) == 33


def test_total_rows_around_33k():
    txs = load(_FILE3)
    assert 30000 < len(txs) < 35000


def test_fuel_grade_mapped():
    txs = load(_FILE3)
    grades = {t.fuel_grade for t in txs}
    assert grades.issubset({'regular', 'premium', 'diesel', 'kerosene', 'lpg', 'unknown'})


def test_amount_positive():
    txs = load(_FILE3)
    assert all(t.amount >= 0 for t in txs)
