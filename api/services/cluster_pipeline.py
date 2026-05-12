"""sklearn KMeans 6 → LLM cluster 라벨링 → Cluster 노드 update.

property-join fallback — Plan 5 polish: switch to graph traversal once full
edges loaded. Aggregates FuelTransaction.cust_id directly without REFUELED.
"""
from __future__ import annotations
import base64
import io
import json
import logging
from typing import List

from api.services.neptune import open_cypher
from api.services.code_interpreter import execute as ci_execute
from api.services.bedrock import converse, ConverseRequest

log = logging.getLogger("gcc.cluster")


def features_query() -> List[dict]:
    """5K customers × 6-dim features (tx, amt, prem_ratio, vip, grade, sido).

    Two-step query — Neptune은 큰 Customer × FuelTransaction join + 6-field
    return을 거부 (50K × N tx에서 OOM/timeout). 분리 + Python merge.
    """
    # Step 1: Customer 속성 (lite, 5K)
    try:
        cust_rows = open_cypher(query=(
            "MATCH (c:Customer) "
            "RETURN c.cust_id AS cust_id, c.vip_yn AS vip, "
            "       c.member_grade AS grade, c.sido_nm AS sido "
            "ORDER BY c.cust_id LIMIT 5000"
        )).get('results', [])
    except Exception as e:
        log.warning("customer attr query failed: %s", e)
        return []
    # Step 2: FuelTransaction 집계 (cust_id별)
    try:
        tx_rows = open_cypher(query=(
            "MATCH (t:FuelTransaction) "
            "WITH t.cust_id AS cust_id, count(t) AS tx, sum(t.amount) AS amt, "
            "     sum(CASE WHEN t.fuel_grade='premium' THEN 1 ELSE 0 END) AS prem "
            "RETURN cust_id, tx, amt, prem"
        )).get('results', [])
    except Exception:
        tx_rows = []
    tx_by_cust = {r['cust_id']: r for r in tx_rows}
    out = []
    for c in cust_rows:
        cid = c.get('cust_id')
        agg = tx_by_cust.get(cid, {})
        tx = int(agg.get('tx') or 0)
        prem = int(agg.get('prem') or 0)
        out.append({
            'cust_id': cid,
            'tx': tx,
            'amt': int(agg.get('amt') or 0),
            'prem': prem,
            'prem_ratio': (prem / tx) if tx > 0 else 0.0,
            'vip': c.get('vip'),
            'grade': c.get('grade'),
            'sido': c.get('sido'),
        })
    return out


def _cluster_locally(rows: List[dict]) -> dict:
    """로컬 sklearn KMeans + matplotlib (api 컨테이너 안)."""
    try:
        import numpy as np
        from sklearn.cluster import KMeans
        from sklearn.preprocessing import StandardScaler
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        try:
            plt.rcParams['font.family'] = 'NanumGothic'
            plt.rcParams['axes.unicode_minus'] = False
        except Exception:
            pass

        # vip → 0/1, grade → ordinal (Silver=1/Gold=2/Black=3/default=0)
        _GRADE_RANK = {'Silver': 1, 'Gold': 2, 'Black': 3}
        # 시도 → 인구·경제 규모 기준 ordinal (대도시 우선). 17 시도 외 → 0.
        _SIDO_RANK = {
            '서울': 8, '경기': 7, '부산': 6, '인천': 5, '대구': 4, '대전': 3, '광주': 2,
            '울산': 2, '세종': 1, '강원': 1, '충북': 1, '충남': 1,
            '전북': 1, '전남': 1, '경북': 1, '경남': 1, '제주': 1,
        }

        X = np.array([
            [
                float(r.get('tx') or 0),
                float(r.get('amt') or 0),
                float(r.get('prem_ratio') or 0),
                1.0 if r.get('vip') == 'Y' else 0.0,
                float(_GRADE_RANK.get((r.get('grade') or '').strip(), 0)),
                float(_SIDO_RANK.get((r.get('sido') or '').strip(), 0)),
            ]
            for r in rows
        ], dtype=float)
        if len(X) < 6:
            return {'assignments': [], 'centroids': [], 'chart_png_b64': ''}

        # StandardScaler — 6 차원 feature 분포 균형. 각 feature가 동등 weight로
        # KMeans 거리 계산에 기여.
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        # n_clusters=6 시도. 만약 KMeans가 자연스럽게 3-4 cluster만 잡으면
        # 일부 cluster centroid가 빈 채로 남음 — 이 경우 라벨링 단계에서
        # 빈 cluster를 "예비/잠재" 등으로 처리.
        km = KMeans(n_clusters=6, random_state=42, n_init=20).fit(X_scaled)
        cluster_labels = km.labels_.tolist()
        assignments = [
            {'cust_id': r['cust_id'], 'cluster': int(l)}
            for r, l in zip(rows, cluster_labels)
        ]

        fig, ax = plt.subplots(figsize=(8, 5))
        sc = ax.scatter(X[:, 0], X[:, 1], c=cluster_labels, cmap='tab10', s=10, alpha=0.65)
        ax.set_xlabel('거래 수 (Transactions)')
        ax.set_ylabel('총 매출 (Revenue)')
        ax.set_title('K-Means 6 군집 (RFM 기반)')
        ax.grid(alpha=0.3)
        plt.colorbar(sc, ax=ax, label='cluster')
        plt.tight_layout()

        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=120)
        plt.close(fig)
        chart = base64.b64encode(buf.getvalue()).decode()

        return {
            'assignments': assignments,
            'centroids': km.cluster_centers_.tolist(),
            'chart_png_b64': chart,
        }
    except Exception as e:
        log.exception("local KMeans failed: %s", e)
        return {'assignments': [], 'centroids': [], 'chart_png_b64': ''}


def cluster_features(rows: List[dict]) -> dict:
    """KMeans 6 + scatter PNG. AgentCore Code Interpreter 시도 후 로컬 fallback.

    AgentCore가 빈 image 반환하면 (현재 PoC 환경) 로컬 sklearn으로 즉시 전환.
    """
    if not rows:
        return {'assignments': [], 'centroids': [], 'chart_png_b64': ''}
    code = (
        "import json\n"
        "import numpy as np\n"
        "from sklearn.cluster import KMeans\n"
        "import matplotlib.pyplot as plt\n"
        f"data = {json.dumps(rows)}\n"
        "X = np.array([[r.get('tx') or 0, r.get('amt') or 0, "
        "r.get('prem_ratio') or 0] for r in data], dtype=float)\n"
        "if len(X) >= 6:\n"
        "    km = KMeans(n_clusters=6, random_state=42, n_init=10).fit(X)\n"
        "    labels = km.labels_.tolist()\n"
        "    out = [{'cust_id': r['cust_id'], 'cluster': int(l)} "
        "for r, l in zip(data, labels)]\n"
        "    fig, ax = plt.subplots(figsize=(7,5))\n"
        "    ax.scatter(X[:,0], X[:,1], c=labels, cmap='tab10', s=8, alpha=0.6)\n"
        "    ax.set_xlabel('거래 수'); ax.set_ylabel('총 매출')\n"
        "    ax.set_title('K-Means 6 클러스터')\n"
        "    plt.tight_layout(); plt.savefig('out.png', dpi=120)\n"
        "    print(json.dumps({'assignments': out, "
        "'centroids': km.cluster_centers_.tolist()}))\n"
        "else:\n"
        "    print(json.dumps({'assignments': [], 'centroids': []}))\n"
    )
    try:
        out = ci_execute(code)
        if out.get('images'):
            payload: dict = {}
            try:
                last = (out.get('output') or '').strip().splitlines()[-1]
                payload = json.loads(last)
            except Exception:
                payload = {}
            chart = base64.b64encode(out['images'][0]).decode()
            if payload.get('assignments') and chart:
                return {
                    'assignments': payload.get('assignments', []),
                    'centroids': payload.get('centroids', []),
                    'chart_png_b64': chart,
                }
        log.warning("AgentCore returned empty for cluster — local sklearn fallback")
    except Exception as e:
        log.warning("AgentCore execute failed (%s) — local fallback", e)
    return _cluster_locally(rows)


def llm_label_clusters(centroids: List[List[float]]) -> List[str]:
    """Ask Sonnet for 6 cluster labels (returns [] on failure).

    Now uses 6-dim centroids (tx, amt, prem_ratio, vip, grade, sido_rank) so
    labels can reflect richer segmentation like "수도권 VIP 충성", "지방 휴면",
    "고급휘발유 전문" 등.
    """
    if not centroids:
        return []
    msg = (
        '다음 6개 클러스터의 centroid 좌표를 보고 한국어 마케팅 라벨을 부여하라.\n'
        '차원: (거래수, 총매출, 고급휘발유비율, VIP여부, 멤버십등급Silver=1/Gold=2/Black=3, 시도등급서울=8~제주=1).\n'
        '각 cluster는 한 줄로 "N. 라벨" 형식 (예: "1. 수도권 VIP 충성"). '
        '의미가 약하면 "예비 N"으로 처리. 정확히 6줄만 응답.\n'
        f'centroids: {centroids}'
    )
    try:
        out = converse(ConverseRequest(
            system='너는 GS Caltex 마케팅 전략가다.',
            messages=[{'role': 'user', 'content': [{'text': msg}]}],
        ))
        text = out['output']['message']['content'][0]['text']
    except Exception:
        return []
    lines = [
        line.split('.', 1)[-1].strip() if '.' in line else line.strip()
        for line in text.split('\n')
        if line.strip()
    ]
    # Pad to 6 even if Sonnet returns fewer.
    while len(lines) < 6:
        lines.append(f'예비 {len(lines) + 1}')
    return lines[:6]


def write_back_clusters(assignments: List[dict], labels: List[str]) -> None:
    """Update Cluster nodes with labels + create BELONGS_TO edges.

    Neptune openCypher silently dropped writes when `'cl-' + toString(r.cluster + 1)`
    was inside MATCH — pre-computing the cluster_id string in Python avoids any
    server-side string-concat / toString quirks. Verified by diagnostic that
    BELONGS_TO=0 after the previous version; this fix produces real edges.
    """
    for i, lbl in enumerate(labels):
        try:
            open_cypher(
                query='MATCH (cl:Cluster {cluster_id: $cid}) SET cl.label = $lbl',
                parameters={'cid': f'cl-{i+1}', 'lbl': lbl},
            )
        except Exception:
            pass
    if not assignments:
        return
    # Pre-compute cluster_id strings so the Cypher MATCH is a simple property lookup.
    rows = [
        {'cust_id': a.get('cust_id'),
         'cluster_id': f'cl-{int(a.get("cluster", 0)) + 1}'}
        for a in assignments
    ]
    # Batch in chunks of 500 so Neptune doesn't OOM on a single 5000-row payload.
    batch_size = 500
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        try:
            open_cypher(
                query=(
                    "UNWIND $rows AS r "
                    "MATCH (c:Customer {cust_id: r.cust_id}) "
                    "MATCH (cl:Cluster {cluster_id: r.cluster_id}) "
                    "MERGE (c)-[:BELONGS_TO]->(cl)"
                ),
                parameters={'rows': batch},
            )
        except Exception:
            log.warning("BELONGS_TO batch %d-%d failed", i, i + len(batch))
