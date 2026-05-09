from data.schemas import Member, Customer
from data.synthetic._common import seeded_rng


def members_for(customers: list[Customer]) -> list[Member]:
    out = []
    for c in customers:
        rng = seeded_rng(f'mem:{c.cust_id}')
        out.append(Member(cust_id=c.cust_id, grade=c.member_grade or 'Silver',
                          points=rng.randint(0, 50000)))
    return out
