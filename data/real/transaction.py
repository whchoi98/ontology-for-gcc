"""file 3 (cust_deal_cntx_intg, 33,113 rows × 33 customers) → FuelTransaction."""
from __future__ import annotations
import yaml
from pathlib import Path
from data.real._common import read_csv_rows, normalize_cust_id, merge_dt_time
from data.schemas import FuelTransaction

# product_cd → fuel_grade 매핑은 opinet_codes.yaml에서 가져옴 (간단판)
_OPINET_PATH = Path('ontology/standards/opinet_codes.yaml')
_OPINET = yaml.safe_load(_OPINET_PATH.read_text(encoding='utf-8')) if _OPINET_PATH.exists() else {}
_PRODUCT_TO_GRADE = {
    # GSC 내부 product_cd가 명시 안 되어있으면 기본 매핑
    '01': 'regular', '02': 'premium', '03': 'diesel',
    '04': 'kerosene', '05': 'lpg',
}


def _payment(row: dict) -> str:
    if row.get('plcc_card_yn', '').strip() == 'Y':
        return 'PLCC'
    if row.get('smart_card_use_yn', '').strip() == 'Y':
        return 'smart'
    if row.get('direct_refuel_card_yn', '').strip() == 'Y':
        return 'direct'
    pt = row.get('payment_type_cd', '').strip()
    return {'01': 'credit', '02': 'cash', '03': 'point'}.get(pt, 'unknown')


def load(path: str) -> list[FuelTransaction]:
    txs: list[FuelTransaction] = []
    for row in read_csv_rows(path):
        cust = normalize_cust_id(row.get('비식별고객번호', ''))
        if not cust:
            continue
        ts = merge_dt_time(row.get('sales_dt'), row.get('sales_time'))
        if not ts:
            continue
        try:
            qty = float(row.get('sales_qty') or 0)
            unit = int(float(row.get('unit_price_amt') or 0))
            amt = int(float(row.get('sales_amt') or 0))
        except ValueError:
            continue
        grade = _PRODUCT_TO_GRADE.get((row.get('product_cd') or '').strip(), 'unknown')
        approval = (row.get('approval_no') or '').strip()
        store = (row.get('store_cd') or '').strip()
        tx_id = f'{approval}-{store}' if approval else f'{cust}-{ts}-{store}'
        try:
            earned = int(float(row.get('earned_general_point') or 0))
        except ValueError:
            earned = 0
        txs.append(FuelTransaction(
            tx_id=tx_id, cust_id=cust, ts=ts, store_cd=store,
            fuel_grade=grade, qty_l=qty, unit_price=unit, amount=amt,
            payment_type=_payment(row),
            earned_general_point=earned,
        ))
    return txs
