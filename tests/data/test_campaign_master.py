import os
import pytest
from pathlib import Path
import glob

RAW = Path(os.environ.get('GCC_RAW_DATA_DIR', './raw_data'))
_m2 = glob.glob(str(RAW / '2*.csv'))
_F2 = _m2[0] if _m2 else str(RAW / '2.캠페인마스터.csv')


@pytest.mark.skipif(not _m2, reason='file 2 missing')
def test_130_campaigns():
    from data.real.campaign_master import load
    out = load(_F2)
    assert len(out) == 130
