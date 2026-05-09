"""file 2 (캠페인마스터, utf-8, 130 rows) → Campaign meta enrichment."""
from __future__ import annotations
import csv
from data.real._common import _resolve_path
from data.schemas import Campaign


def load(path: str) -> dict[str, Campaign]:
    out: dict[str, Campaign] = {}
    rp = _resolve_path(path)
    with open(rp, encoding='utf-8') as f:
        rdr = csv.DictReader(f)
        for r in rdr:
            cd = (r.get('cmpg_cd') or '').strip()
            if not cd:
                continue
            out[cd] = Campaign(
                campaign_cd=cd,
                name_kr=(r.get('cmpg_nm') or '').strip() or cd,
                purpose_nm=(r.get('cmpg_prps_nm') or '').strip() or None,
                lcls_nm=(r.get('cmpg_lcls_nm') or '').strip() or None,
                scls_nm=(r.get('cmpg_scls_nm') or '').strip() or None,
                start_dt=(r.get('cmpg_strt_dt') or '00000000').replace('-', '')[:8],
                end_dt=(r.get('cmpg_end_dt') or '00000000').replace('-', '')[:8],
            )
    return out
