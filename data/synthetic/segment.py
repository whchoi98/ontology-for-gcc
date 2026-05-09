from data.schemas import Segment


def get_initial_segments() -> list[Segment]:
    labels = ['고급휘발유 충성', '주말 장거리', 'PLCC 미보유', '신규 가입', 'PM+M 혼유',
              '디젤 전환자', 'EV 후보', '도시 출퇴근', '이메일 비수신', '쿠폰 사용 활발',
              'app 활성', 'app 비활성', 'KIXX 멤버', 'VIP', '소액 빈번',
              '고액 드뮨', 'CVS 동시이용', '셀프 선호', '풀서비스 선호', '신규 디지털']
    return [Segment(segment_id=f'seg-{i+1:03d}', label=l, seed_cust_ids=[]) for i, l in enumerate(labels)]
