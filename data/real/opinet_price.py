"""file 5 (TB_T_OPINET_PRICE, 71,766 rows × 6일) → FuelPrice (source=real)."""
from __future__ import annotations
import yaml
from pathlib import Path
from data.real._common import read_csv_rows, normalize_dt
from data.schemas import FuelPrice

_OPINET_PATH = Path('ontology/standards/opinet_codes.yaml')
_OPINET = yaml.safe_load(_OPINET_PATH.read_text(encoding='utf-8')) if _OPINET_PATH.exists() else {}
_GRADES = _OPINET.get('fuel_grade', {})   # pmgs_amt → premium etc.


def load(path: str) -> list[FuelPrice]:
    out: list[FuelPrice] = []
    for row in read_csv_rows(path):
        opinet = (row.get('opinet_no') or '').strip()
        dt = normalize_dt(row.get('std_dt'))
        if not (opinet and dt):
            continue
        for col, meta in _GRADES.items():
            v = (row.get(col) or '').strip()
            if not v or v in {'0', '0.00', 'NULL'}:
                continue
            try:
                amount = int(float(v))
            except ValueError:
                continue
            if amount <= 0:
                continue
            out.append(FuelPrice(
                station_opinet_no=opinet, fuel_grade=meta['grade'],
                dt=dt, amount=amount, source='real',
            ))
    return out
