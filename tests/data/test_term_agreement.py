import os
import pytest
from pathlib import Path
import glob

RAW = Path(os.environ.get('GCC_RAW_DATA_DIR', './raw_data'))
_matches = glob.glob(str(RAW / '4*.csv'))
_FILE4 = _matches[0] if _matches else str(RAW / '4.dw_cu_crd_mast_약관동의내역.csv')

pytestmark = pytest.mark.skipif(not _matches, reason='file 4 not present')

from data.real.term_agreement import load


def test_returns_terms_and_agreements():
    out = load(_FILE4)
    assert set(out.keys()) == {'terms', 'agreements'}


def test_500_unique_customers_in_agreements():
    out = load(_FILE4)
    cust_ids = {a.cust_id for a in out['agreements']}
    assert len(cust_ids) == 500


def test_zero_dates_become_null():
    out = load(_FILE4)
    # '00000000' should be normalized to None (we serialize as missing)
    null_count = sum(1 for a in out['agreements'] if a.approval_dt == '00000000')
    assert null_count == 0  # all '00000000' should be filtered
