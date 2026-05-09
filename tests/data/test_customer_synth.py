from data.synthetic.customer import enrich_customer_attributes


def test_enrich_returns_15_attrs():
    c = enrich_customer_attributes(cust_id='c001', data_depth='deep-history',
                                    real_gender='M', real_age='30')
    # 15 핵심 + data_depth + cust_id = 16 fields
    assert c.cust_id == 'c001'
    assert c.gender_cd == 'M'        # 실 성별 우선 사용
    assert c.age_section_cd == '30'  # 실 연령대 우선
    assert c.data_depth == 'deep-history'
    assert c.sido_nm in {'서울', '경기', '인천', '부산', '대구', '대전', '세종',
                         '광주', '울산', '경북', '경남', '전북', '전남',
                         '충북', '충남', '강원', '제주'}


def test_seeded_deterministic():
    c1 = enrich_customer_attributes(cust_id='c001', data_depth='lookalike-syn')
    c2 = enrich_customer_attributes(cust_id='c001', data_depth='lookalike-syn')
    assert c1.sido_nm == c2.sido_nm  # 동일 seed = 동일 결과
