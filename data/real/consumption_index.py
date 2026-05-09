"""file 6 (현대카드소비지수, 287 rows × 287 customers) → ConsumptionIndex."""
from __future__ import annotations
from data.real._common import read_csv_rows, normalize_cust_id
from data.schemas import ConsumptionIndex

CORE_FIELDS = {
    '보너스카드_경과월수': 'bonus_card_months',
    '에너지플러스앱_경과월수': 'energy_plus_app_months',
    '차량 필요 지수': 'car_need_idx',
    '가스 충전소 선호 지수': 'gas_station_pref_idx',
    '자동차 금융 선호 지수': 'car_finance_pref_idx',
}


def _coerce(v: str):
    if not v or v.strip().upper() in {'NULL', 'NA', ''}:
        return None
    try:
        return float(v.strip())
    except ValueError:
        return None


def load(path: str) -> list[ConsumptionIndex]:
    out = []
    for row in read_csv_rows(path):
        cust = normalize_cust_id(row.get('비식별고객번호', ''))
        if not cust:
            continue
        core = {tgt: _coerce(row.get(src, '')) for src, tgt in CORE_FIELDS.items()}
        # bonus_card_months / energy_plus_app_months are int — coerce
        for k in ('bonus_card_months', 'energy_plus_app_months'):
            if core[k] is not None:
                core[k] = int(core[k])
        extras = {k: row[k] for k in row if k not in CORE_FIELDS and k != '비식별고객번호'}
        out.append(ConsumptionIndex(cust_id=cust, **core, extras=extras))
    return out
