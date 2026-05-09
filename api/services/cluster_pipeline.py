"""sklearn KMeans 6 → LLM cluster 라벨링 → Cluster 노드 update.

property-join fallback — Plan 5 polish: switch to graph traversal once full
edges loaded. Aggregates FuelTransaction.cust_id directly without REFUELED.
"""
from __future__ import annotations
import base64
import json
from typing import List

from api.services.neptune import open_cypher
from api.services.code_interpreter import execute as ci_execute
from api.services.bedrock import converse, ConverseRequest


def features_query() -> List[dict]:
    """5K customers × (tx, amt, prem_ratio) features."""
    q = """MATCH (t:FuelTransaction)
           WITH t.cust_id AS cust_id,
                count(t) AS tx,
                sum(t.amount) AS amt,
                sum(CASE WHEN t.fuel_grade='premium' THEN 1 ELSE 0 END) AS prem
           RETURN cust_id, tx, amt, prem,
                  CASE WHEN tx > 0 THEN toFloat(prem)/tx ELSE 0 END AS prem_ratio
           LIMIT 5000"""
    res = open_cypher(query=q)
    return res.get('results', [])


def cluster_features(rows: List[dict]) -> dict:
    """KMeans 6 + scatter PNG; returns assignments + centroids + chart_png_b64."""
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
    out = ci_execute(code)
    payload: dict = {}
    try:
        last = (out.get('output') or '').strip().splitlines()[-1]
        payload = json.loads(last)
    except Exception:
        payload = {}
    chart = (
        base64.b64encode(out['images'][0]).decode()
        if out.get('images') else ''
    )
    return {
        'assignments': payload.get('assignments', []),
        'centroids': payload.get('centroids', []),
        'chart_png_b64': chart,
    }


def llm_label_clusters(centroids: List[List[float]]) -> List[str]:
    """Ask Sonnet for 6 single-word cluster labels (returns [] on failure)."""
    if not centroids:
        return []
    msg = (
        '다음 6개 클러스터 centroid (거래수, 총매출, 고급휘발유 비율)에 '
        '마케팅 액션 지향 라벨을 한 단어씩 부여하라. 6줄로만 응답하라.\n'
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
    # 간단 파싱 — Plan 5에서 정규식·JSON 강제 출력으로 강화
    lines = [
        line.split(':')[-1].strip()
        for line in text.split('\n')
        if line.strip()
    ]
    return lines[:6]


def write_back_clusters(assignments: List[dict], labels: List[str]) -> None:
    """Update Cluster nodes with labels + create BELONGS_TO edges."""
    for i, lbl in enumerate(labels):
        try:
            open_cypher(
                query='MATCH (cl:Cluster {cluster_id: $cid}) SET cl.label = $lbl',
                parameters={'cid': f'cl-{i+1}', 'lbl': lbl},
            )
        except Exception:
            pass
    if assignments:
        try:
            open_cypher(
                query=(
                    "UNWIND $rows AS r "
                    "MATCH (c:Customer {cust_id: r.cust_id}) "
                    "MATCH (cl:Cluster {cluster_id: 'cl-' + toString(r.cluster + 1)}) "
                    "MERGE (c)-[:BELONGS_TO]->(cl)"
                ),
                parameters={'rows': assignments},
            )
        except Exception:
            pass
