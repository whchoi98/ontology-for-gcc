"""raw_data CSV 어댑터 공통 유틸 — cp949 정규화, 비식별고객번호 normalize.

Note: macOS/일부 Linux는 한글 파일명을 NFD(분해형)로 보관하지만 Python 코드 리터럴은
NFC(결합형)로 들어옴. 파일을 열기 전에 NFD로 normalize 하여 매칭."""
from __future__ import annotations
from pathlib import Path
import csv
import os
import unicodedata
from typing import Iterator

ENCODING = 'cp949'   # raw_data 9개 중 file 2(utf-8) 외 모두 cp949


def _resolve_path(path: str | Path) -> str:
    """파일명을 NFD로 정규화하여 디스크상 경로와 매칭. 못 찾으면 원본 반환."""
    p = str(path)
    if os.path.exists(p):
        return p
    # 같은 디렉토리에서 대소문자/Unicode normalize 매칭 시도
    parent = os.path.dirname(p) or '.'
    target = os.path.basename(p)
    if not os.path.isdir(parent):
        return p
    target_nfd = unicodedata.normalize('NFD', target)
    target_nfc = unicodedata.normalize('NFC', target)
    for entry in os.listdir(parent):
        if entry == target_nfd or entry == target_nfc \
                or unicodedata.normalize('NFC', entry) == target_nfc:
            return os.path.join(parent, entry)
    return p


def read_csv_rows(path: str | Path, enc: str = ENCODING) -> Iterator[dict[str, str]]:
    """cp949 → utf-8 정규화 + DictReader 반환."""
    rp = _resolve_path(path)
    with open(rp, encoding=enc, errors='replace', newline='') as f:
        rdr = csv.DictReader(f)
        for row in rdr:
            yield {(k or '').strip(): (v.strip() if v else '') for k, v in row.items()}


def normalize_cust_id(raw: str) -> str:
    """비식별고객번호 → 표준 cust_id 형식. 빈값/'NULL' → ''. 공백 제거."""
    if not raw or raw.upper() in {'NULL', 'NA', 'NONE', '0', '00000000'}:
        return ''
    return raw.strip()


def normalize_dt(raw: str | None) -> str | None:
    """'00000000' 결측 처리 + 'YYYYMMDD' 또는 'YYYY-MM-DD' 형식 통일."""
    if not raw or raw == '00000000':
        return None
    s = raw.strip().replace('-', '').replace('/', '')
    if len(s) == 8 and s.isdigit():
        return s
    return None


def merge_dt_time(dt: str | None, hhmmss: str | None) -> str | None:
    """sales_dt + sales_time → ISO8601 KST. dt 또는 둘 다 None이면 None."""
    if not dt:
        return None
    dt8 = normalize_dt(dt)
    if not dt8:
        return None
    iso_date = f'{dt8[:4]}-{dt8[4:6]}-{dt8[6:]}'
    if hhmmss and hhmmss.strip():
        h = hhmmss.strip().zfill(6)
        return f'{iso_date}T{h[:2]}:{h[2:4]}:{h[4:6]}+09:00'
    return f'{iso_date}T00:00:00+09:00'
