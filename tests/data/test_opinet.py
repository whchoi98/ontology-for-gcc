import os
import pytest
from pathlib import Path
import glob

RAW = Path(os.environ.get('GCC_RAW_DATA_DIR', './raw_data'))
_m5 = glob.glob(str(RAW / '5*.csv'))
_m7 = glob.glob(str(RAW / '7*.csv'))
_F5 = _m5[0] if _m5 else str(RAW / '5.tco017_주유소가격.csv')
_F7 = _m7[0] if _m7 else str(RAW / '7.tco016_주유소마스터.csv')

pytestmark = pytest.mark.skipif(not (_m5 and _m7), reason='files 5/7 missing')

from data.real.opinet_price import load as load_price
from data.real.opinet_station import load as load_station


def test_price_source_real():
    rows = load_price(_F5)
    assert all(r.source == 'real' for r in rows)


def test_price_5_grades():
    rows = load_price(_F5)
    grades = {r.fuel_grade for r in rows}
    assert grades.issubset({'regular', 'premium', 'diesel', 'kerosene', 'lpg'})


def test_station_452_GSC_or_more():
    stations, regions = load_station(_F7)
    assert len(stations) >= 452


def test_station_brand_via_codes():
    stations, _ = load_station(_F7)
    brands = {s.brand_cd for s in stations}
    # GSC 자체 station만 있을 수도, 경쟁사 mix일 수도
    assert brands.issubset({'GSC', 'SK', 'HD', 'SOIL', 'NHJN', 'ALK', 'OTHER'})
