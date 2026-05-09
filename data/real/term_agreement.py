"""file 4 (DW_CU_AGRM_AGR, 17,616 rows × 500 customers) → Term + TermAgreement."""
from __future__ import annotations
from data.real._common import read_csv_rows, normalize_cust_id, normalize_dt
from data.schemas import Term, TermAgreement

# 약관 카탈로그 — file 4 raw에 있는 term_cd 발견 후 풍부화 (Plan 5)
_TERM_CATALOG = {
    'T001': ('이용약관 동의', 'Y'),
    'T002': ('개인정보 수집·이용 동의', 'Y'),
    'T003': ('마케팅 정보 수신 동의', 'N'),
    'T004': ('위치기반 서비스 동의', 'N'),
    # 발견되는 term_cd는 dynamic 추가
}


def load(path: str) -> dict[str, list]:
    terms: dict[str, Term] = {}
    agreements: list[TermAgreement] = []
    for i, row in enumerate(read_csv_rows(path)):
        cust = normalize_cust_id(row.get('비식별고객번호', ''))
        term_cd = (row.get('term_cd') or '').strip()
        if not (cust and term_cd):
            continue
        if term_cd not in terms:
            name, required = _TERM_CATALOG.get(term_cd, (term_cd, 'N'))
            mkt_eligible = 'Y' if 'T003' in term_cd or 'mark' in name.lower() else 'N'
            terms[term_cd] = Term(
                term_cd=term_cd, name_kr=name,
                required_yn=required,
                marketing_eligible_yn=mkt_eligible,
            )
        approved = 'Y' if (row.get('term_approval_cd') or '').strip() in {'01', 'Y'} else 'N'
        approval_dt = normalize_dt(row.get('approval_dt'))
        if approval_dt is None:
            continue   # '00000000' 결측은 제외
        agreements.append(TermAgreement(
            agreement_id=f'{cust}-{term_cd}-{i}',
            cust_id=cust, term_cd=term_cd, approval_dt=approval_dt,
            approval_channel_cd=(row.get('approval_channel_cd') or '').strip() or None,
            approved_yn=approved,
        ))
    return {'terms': list(terms.values()), 'agreements': agreements}
