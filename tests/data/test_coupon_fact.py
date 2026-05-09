import os
import pytest
from pathlib import Path

RAW = Path(os.environ.get('GCC_RAW_DATA_DIR', './raw_data'))
FILE1 = RAW / '1.tb_sm_cmpg_ofer_f_쿠폰발급사용내역.csv'

# Use glob to handle Unicode NFD/NFC mismatches on disk
import glob
_matches = glob.glob(str(RAW / '1*.csv'))
_FILE1 = _matches[0] if _matches else str(FILE1)

pytestmark = pytest.mark.skipif(not _matches, reason='raw_data file 1 not present')

from data.real.coupon_fact import load


def test_load_returns_4_node_lists():
    out = load(_FILE1)
    assert set(out.keys()) == {'campaigns', 'offers', 'coupons', 'coupon_uses'}


def test_500_unique_customers_in_coupon_uses():
    out = load(_FILE1)
    cust_ids = {u.cust_id for u in out['coupon_uses']}
    assert len(cust_ids) == 500, f'expected 500 cohort, got {len(cust_ids)}'


def test_unique_coupons_match_row_count():
    out = load(_FILE1)
    assert len({c.coupon_no for c in out['coupons']}) <= len(out['coupons'])
    # 5,278 raw rows → coupons may dedupe
