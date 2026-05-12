"""OpenSearch index seed — 25 클래스 + 14 시나리오 + 5 부서 페르소나 description.

ENSURE_INDEX → bulk_index에서 검색 의미 매칭에 충분한 한국어 description을
text + 1024-dim Cohere v4 embedding으로 인덱싱. 검색 (시나리오 A)이 자연어로
"고급휘발유 30대 직장인" 같은 query를 받았을 때 이 인덱스에서 hybrid (BM25 +
KNN) 결과를 반환.
"""
from __future__ import annotations
import json
import logging

from data.loader.opensearch_index import ensure_index, bulk_index

log = logging.getLogger("gcc.opensearch.seed")


CLASS_DESCRIPTIONS: list[dict] = [
    {"name": "Customer",            "ko": "고객 — 비식별 cust_id, 연령대(age_section_cd 20/30/40/50/60), 성별(gender_cd M/F), 거주 시도/시군구(sido_nm/sgg_nm), 직업코드(occupation_cd OFC/SVC/TCH/STD/OTH), 멤버십 등급(member_grade Silver/Gold/Black), VIP 여부, PLCC 보유, 주 이용 주유소(primary_site_cd), KIXX 가입일."},
    {"name": "Persona",             "ko": "페르소나 — 5 부서 (마케팅/고객전략/데이터·AI/CRM·회원사업/리테일영업) 분석 시점. KPI 가중치, 시나리오 우선순위, 시스템 프롬프트 어조 정의."},
    {"name": "Cluster",             "ko": "클러스터 — KMeans 6 군집 결과. 충성 헤비유저, 가격민감 가족, 도시 가벼운 사용자, 디젤 비즈니스 등 LLM 라벨링."},
    {"name": "Segment",             "ko": "세그먼트 — 마케팅 타겟팅용 사전 정의 그룹. 고급휘발유 충성도 높은 30대 직장인, VIP Black 등급, 디젤 헤비유저 등."},
    {"name": "Member",              "ko": "멤버십 — 보너스카드 회원 정보. 등급(Silver/Gold/Black/Platinum), PLCC 카드 매핑, 멤버 가입 채널(앱/오프라인)."},
    {"name": "FuelTransaction",     "ko": "주유 거래 — 일자별 주유 내역. 유종(휘발유/경유/고급휘발유/LPG), 결제수단(credit/cash/app_pay), 금액, 리터, 주유소 site_cd, 시간대."},
    {"name": "AppEvent",            "ko": "앱 이벤트 — 모바일 앱 행동 로그. screen_view, button_click, coupon_view, signup, login. 에어브릿지 SDK 수집 260만건."},
    {"name": "SurveyResponse",      "ko": "설문 응답 — 운전중 불편요소 설문. 셀프 vs 풀서비스 선호, 주유 대기시간 만족도, 결제수단 선호도."},
    {"name": "CouponUse",           "ko": "쿠폰 사용 — 발급 쿠폰의 실제 사용 로그. 캠페인 추적, ROI 계산용 attribution 핵심 데이터."},
    {"name": "PaymentMethod",       "ko": "결제 수단 — 신용/체크/현금/앱페이/포인트. 멤버십 등급별 채널 분포 분석."},
    {"name": "Campaign",            "ko": "캠페인 — 마케팅 캠페인 마스터. 220개 캠페인, SMS/푸시/이메일/현장 채널, 타겟 세그먼트, 시작·종료 일자."},
    {"name": "Coupon",              "ko": "쿠폰 — 캠페인이 발행한 할인 쿠폰. 1,800건. 금액, 유효기간, 적용 유종 조건."},
    {"name": "Offer",               "ko": "오퍼 — 캠페인이 제안한 할인 조건. 420건. 적용 카드, 멤버십 등급, 주유소."},
    {"name": "Channel",             "ko": "채널 — 마케팅 발송 채널. SMS, 카카오톡, 앱푸시, 이메일, 현장 POP. 12종."},
    {"name": "CampaignSms",         "ko": "SMS 발송 — 캠페인 SMS 발송 로그 (DW_CP_SM_CAMP_MSG 청사진). 58K건 발송, open/click/conversion 추적."},
    {"name": "CampaignAggregation", "ko": "캠페인 집계 — TB_SM_CMPG_OFER_S 일·주·월 집계. ROI baseline vs uplift 비교용."},
    {"name": "FuelProduct",         "ko": "유종 — 휘발유, 경유, 고급휘발유(PM), 등유, LPG. Opinet 코드 매핑."},
    {"name": "GasStation",          "ko": "주유소 — 8.5K 직영 + 자영 + 경쟁사 주유소. 시도/시군구, 브랜드(GSC/현대/SK/S-Oil), 셀프 여부, 가격 시계열."},
    {"name": "FuelPrice",           "ko": "가격 시계열 — 1.4M건 일별 주유소·유종 가격 (Opinet 1년치 수집). 권역별 평균 트렌드."},
    {"name": "Region",              "ko": "지역 — KOSTAT 행정구역 코드 기반 시도/시군구. 17개 시도, 250개+ 시군구."},
    {"name": "Term",                "ko": "약관 — 마케팅 활용 동의, 개인정보 제3자 제공, SMS 수신 동의 등 24개 약관."},
    {"name": "TermAgreement",       "ko": "약관 동의 — 고객별 약관 동의 매트릭스 180K건. 마케팅 캠페인 컴플라이언스 게이트."},
    {"name": "ConsumptionIndex",    "ko": "소비지수 — 현대카드 외부 신호. 시도·연령대별 자동차/외식/여가 소비 카테고리 인덱스 360건."},
    {"name": "WeatherObservation",  "ko": "기상 관측 — KMA 기상청 API 수집 1,275건. 시도별 일별 기온, 강수량, 풍속, 습도. 날씨 × 주유 상관 분석."},
    {"name": "TimeSlot",            "ko": "시간대 — 96 슬롯 (15분 단위). 주유 거래·앱 이벤트 시간 차원 분석용."},
]


SCENARIO_DESCRIPTIONS: list[dict] = [
    {"code": "A", "title": "하이브리드 검색",   "ko": "자연어 쿼리를 BM25 (Nori 한국어 분석기) + Cohere KNN 임베딩으로 hybrid 검색. RRF fusion + Cohere rerank-v3 + Neptune 1-hop subgraph 시각화."},
    {"code": "B", "title": "페르소나 챗봇",     "ko": "Bedrock Sonnet 4.6 + AgentCore Memory 단·장기 + Bedrock Guardrails 4 토픽 + 10 도구 호출 SSE 스트리밍."},
    {"code": "C", "title": "인사이트 카드",     "ko": "Neptune 집계 쿼리 + Sonnet 자연어 요약 + AgentCore Code Interpreter matplotlib (NanumGothic) 차트 생성."},
    {"code": "D", "title": "페르소나 매칭",     "ko": "Customer KPI × Persona 가중치 → 매칭 점수. 부서별 차별화 포인트 시각화."},
    {"code": "E", "title": "고객 클러스터링",   "ko": "KMeans 6 군집 + LLM 라벨링 + Neptune Cluster 노드 write-back. 충성·가격민감·도시·디젤 등."},
    {"code": "F", "title": "룩어라이크 확장",   "ko": "Seed 페르소나 → 50K 합성 코호트 임베딩 KNN → 유사 고객 풀 확장."},
    {"code": "G", "title": "캠페인 ROI",         "ko": "Bayesian 분포 시뮬레이션 + SMS 발송 효율 + 어트리뷰션 lift 측정."},
    {"code": "H", "title": "권역 경쟁 지도",     "ko": "시도 choropleth + GSC vs 경쟁사 매트릭스 + Region 드릴다운 react-simple-maps."},
    {"code": "I", "title": "약관·가드레일",     "ko": "TermAgreement 매트릭스 추적 + Bedrock Guardrails 4 토픽 위반 경로 + 컴플라이언스 게이트."},
    {"code": "J", "title": "외부 시그널 융합",   "ko": "현대카드 소비지수 + 앱 행동 + 설문 응답 + KMA 날씨 cross-source narrative."},
    {"code": "K", "title": "이상 행동 탐지",     "ko": "PM+M 92 RON DIY 블렌딩 (PDF 3페이지 시그니처) + 디젤→premium 전환 outlier 매칭."},
    {"code": "L", "title": "결제·멤버십",       "ko": "결제 수단 × 가격 × 채널 × 멤버십 등급 매트릭스 + 유지율 분석."},
    {"code": "M", "title": "고객 통합 여정",     "ko": "App + FuelTransaction + Term + Coupon 타임라인 + 유종 전환 강조 (PDF 3 시그니처)."},
    {"code": "N", "title": "날씨 × 주유 상관",   "ko": "기상청 WeatherObservation × FuelTransaction 산점도 + 권역별 강수·기온 상관 계수."},
]


PERSONA_DESCRIPTIONS: list[dict] = [
    {"id": "marketing",  "ko": "마케팅 — 캠페인 ROI, 타겟팅, SMS 발송 효율 우선. 시나리오 G/B/F 중심. 시니어 마케터 어조."},
    {"id": "strategy",   "ko": "고객전략 — 클러스터링, 페르소나 매칭, 행동 변화 우선. 시나리오 D/E/K 중심. 세그먼트·전략·약관 컴플라이언스 어조."},
    {"id": "data-ai",    "ko": "데이터·AI — 인사이트 생성, 외부 신호 결합, 이상 탐지 우선. 시나리오 C/J/K 중심. sklearn·embeddings·fairness 어조."},
    {"id": "crm",        "ko": "CRM·회원사업 — 결제·멤버십, 컴플라이언스, 페르소나 차별화 우선. 시나리오 L/I/D 중심. 멤버십 등급·포인트·PLCC 어조."},
    {"id": "retail-ops", "ko": "리테일영업 — 권역 경쟁 주유소 지도, 룩어라이크, 검색 우선. 시나리오 H/F/A 중심. 주유소 운영·매출·셀프 비율 어조."},
]


def build_documents(embed_fn) -> list[dict]:
    """Compose all (class + scenario + persona) documents with embeddings."""
    docs: list[dict] = []

    texts: list[str] = []
    metas: list[dict] = []

    for c in CLASS_DESCRIPTIONS:
        texts.append(f"{c['name']}: {c['ko']}")
        metas.append({"doc_id": f"class:{c['name']}", "class_name": c["name"],
                      "metadata": {"kind": "class", "name": c["name"]}})
    for s in SCENARIO_DESCRIPTIONS:
        texts.append(f"시나리오 {s['code']} {s['title']}: {s['ko']}")
        metas.append({"doc_id": f"scenario:{s['code']}", "class_name": "Scenario",
                      "metadata": {"kind": "scenario", "code": s["code"], "title": s["title"]}})
    for p in PERSONA_DESCRIPTIONS:
        texts.append(f"페르소나 {p['id']}: {p['ko']}")
        metas.append({"doc_id": f"persona:{p['id']}", "class_name": "Persona",
                      "metadata": {"kind": "persona", "id": p["id"]}})

    log.info("seed: embedding %d documents", len(texts))
    vectors = embed_fn(texts)
    log.info("seed: embeddings ready (dim=%d)", len(vectors[0]) if vectors else 0)

    for i, m in enumerate(metas):
        docs.append({**m, "text": texts[i], "embedding": vectors[i]})
    return docs


def run(recreate: bool = False) -> dict:
    """Idempotent: ensure index, embed seed corpus, bulk index. Safe to re-run.

    Pass recreate=True (env RECREATE_INDEX=true) to drop the existing index
    before creating it — needed when the embedding dimension changes.
    """
    from api.services.bedrock import embed
    log.info("seed: ensuring index (recreate=%s)", recreate)
    ensure_index(recreate=recreate)
    docs = build_documents(embed)
    log.info("seed: bulk_index %d docs", len(docs))
    bulk_index(docs)
    return {"indexed": len(docs), "recreated": recreate}


if __name__ == "__main__":
    import os
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    result = run(recreate=os.environ.get("RECREATE_INDEX", "").lower() == "true")
    print(json.dumps(result, ensure_ascii=False))
