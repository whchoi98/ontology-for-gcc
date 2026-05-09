"""file 8 (Airbridge, 122,832 rows × 352 customers) → AppEvent.

사용자 노트: event_name 한글 일부 깨짐 — 우선 무시."""
from __future__ import annotations
from data.real._common import read_csv_rows, normalize_cust_id
from data.schemas import AppEvent


def load(path: str) -> list[AppEvent]:
    events = []
    for i, row in enumerate(read_csv_rows(path)):
        cust = normalize_cust_id(row.get('비식별고객번호', '')) or None
        ts = (row.get('event datetime') or '').strip()
        if not ts:
            continue
        events.append(AppEvent(
            event_id=f'evt-{i:08d}',
            cust_id=cust,
            ts=ts,
            event_action=(row.get('event action', '') or 'unknown')[:120],
            event_label=(row.get('event label') or None),
            platform=(row.get('platform') or 'unknown'),
        ))
    return events
