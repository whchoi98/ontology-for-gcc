import os
import pytest
from pathlib import Path
import glob

RAW = Path(os.environ.get('GCC_RAW_DATA_DIR', './raw_data'))
_m6 = glob.glob(str(RAW / '6*.csv'))
_m8 = glob.glob(str(RAW / '8*.csv'))
_m9 = glob.glob(str(RAW / '9*.csv'))
_F6 = _m6[0] if _m6 else str(RAW / '6.현대카드소비지수.csv')
_F8 = _m8[0] if _m8 else str(RAW / '8.에어브릿지수집앱행동데이터.csv')
_F9 = _m9[0] if _m9 else str(RAW / '9.운전중불편요소설문.csv')


@pytest.mark.skipif(not _m6, reason='file 6 missing')
def test_consumption_index_287():
    from data.real.consumption_index import load
    rows = load(_F6)
    assert len({r.cust_id for r in rows}) == 287


@pytest.mark.skipif(not _m8, reason='file 8 missing')
def test_airbridge_352_customers():
    from data.real.airbridge import load
    evts = load(_F8)
    cs = {e.cust_id for e in evts if e.cust_id}
    assert len(cs) == 352


@pytest.mark.skipif(not _m9, reason='file 9 missing')
def test_survey_partial_mapping():
    from data.real.survey import load
    out = load(_F9)
    mapped = sum(1 for s in out if s.cust_id)
    anon = sum(1 for s in out if not s.cust_id)
    assert mapped + anon == len(out)
    assert anon > 25000
