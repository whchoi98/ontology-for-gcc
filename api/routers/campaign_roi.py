# api/routers/campaign_roi.py — 시나리오 G: 캠페인 ROI 시뮬레이터 + Bayesian 분포 차트
from __future__ import annotations
import base64
from typing import Optional

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.services.tools.campaign_simulator import run as sim_run
from api.services.code_interpreter import execute as ci_execute
from api.services.insight_summary import summarize, summarize_stream
from api.services.sse import stream_phases

router = APIRouter(prefix='/api/campaign-roi', tags=['campaign_roi'])


class RoiRequest(BaseModel):
    coupon_amt: int = 1000
    target_segment_id: str = 'seg-001'
    duration_days: int = 30
    persona_id: Optional[str] = 'marketing'


def _render_locally(mu: float) -> str:
    """로컬 matplotlib 정규분포 차트 (api 컨테이너 안)."""
    try:
        import io
        import numpy as np
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        try:
            plt.rcParams['font.family'] = 'NanumGothic'
            plt.rcParams['axes.unicode_minus'] = False
        except Exception:
            pass

        sigma = max(mu * 0.4, 1e-6)
        samples = np.clip(np.random.normal(mu, sigma, 5000), 0, 1)
        fig, ax = plt.subplots(figsize=(8, 4))
        ax.hist(samples, bins=40, color='#3b82f6', alpha=0.7, edgecolor='#1e40af')
        ax.axvline(mu, color='#ef4444', linestyle='--', linewidth=2,
                   label='point estimate {:.3f}'.format(mu))
        ax.set_title('전환률 분포 (Bayesian posterior)', fontsize=12)
        ax.set_xlabel('conversion rate')
        ax.set_ylabel('frequency')
        ax.legend()
        ax.grid(alpha=0.3)
        plt.tight_layout()

        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=120)
        plt.close(fig)
        return base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return ''


def _render_distribution_chart(mu: float) -> str:
    """matplotlib normal-distribution PNG → base64. Code Interpreter + 로컬 fallback."""
    code = (
        "import numpy as np\n"
        "import matplotlib.pyplot as plt\n"
        f"mu = {mu}\n"
        "sigma = max(mu * 0.4, 1e-6)\n"
        "samples = np.clip(np.random.normal(mu, sigma, 5000), 0, 1)\n"
        "fig, ax = plt.subplots(figsize=(7,3.5))\n"
        "ax.hist(samples, bins=40, color='#3b82f6', alpha=0.7)\n"
        "ax.axvline(mu, color='red', linestyle='--', "
        "label='point estimate {:.3f}'.format(mu))\n"
        "ax.set_title('전환률 분포 (Bayesian 추정)')\n"
        "ax.set_xlabel('conversion rate'); ax.set_ylabel('density'); ax.legend()\n"
        "plt.tight_layout(); plt.savefig('out.png', dpi=120)\n"
    )
    try:
        out = ci_execute(code)
        if out.get('images'):
            return base64.b64encode(out['images'][0]).decode()
    except Exception:
        pass
    return _render_locally(mu)


_SOURCES = ['synthetic:CampaignSim', 'real:CampaignAggregation']
_EXTRA = 'Bayesian 분포 시뮬 결과의 신뢰성, 쿠폰액 한계 효용, 캠페인 기간·세그먼트 선택 권고.'


def _data_summary(req: RoiRequest, point: dict) -> str:
    pc = float(point.get('projected_conversion', 0.0))
    base = point.get('baseline_roi_pct', 0)
    return (
        f"쿠폰 {req.coupon_amt}원 × 세그먼트 {req.target_segment_id} × {req.duration_days}일 시뮬. "
        f"projected_conversion={pc:.4f} ({pc*100:.2f}%), baseline_roi={base}%. "
        f"노트: {point.get('note', '')}"
    )


@router.post('')
def simulate(req: RoiRequest) -> dict:
    point = sim_run(
        req.model_dump(),
        persona_id=req.persona_id or 'marketing',
        session_id='web', cust_id=None,
    )
    chart = _render_distribution_chart(float(point.get('projected_conversion', 0.0)))
    summary = summarize(
        req.persona_id, 'G', '캠페인 ROI 시뮬레이션',
        _data_summary(req, point), sources=_SOURCES, extra_instruction=_EXTRA,
    )
    return {**point, 'chart_png_b64': chart, 'summary': summary}


@router.post('/stream')
async def simulate_stream(req: RoiRequest) -> StreamingResponse:
    """SSE: simulating → chart_render → summary_streaming → result."""
    async def gen():
        yield ('phase', {'name': 'computing',
                         'desc': f'쿠폰 {req.coupon_amt}원 × {req.duration_days}일 Bayesian 시뮬'})
        point = sim_run(
            req.model_dump(),
            persona_id=req.persona_id or 'marketing',
            session_id='web', cust_id=None,
        )
        pc = float(point.get('projected_conversion', 0.0))
        yield ('phase', {'name': 'compute_done',
                         'desc': f'예상 전환률 {pc*100:.2f}%'})

        yield ('phase', {'name': 'rendering_chart'})
        chart = _render_distribution_chart(pc)
        yield ('phase', {'name': 'chart_ready'})

        yield ('phase', {'name': 'summary_streaming'})
        chunks: list[str] = []
        for chunk in summarize_stream(
            req.persona_id, 'G', '캠페인 ROI 시뮬레이션',
            _data_summary(req, point), sources=_SOURCES, extra_instruction=_EXTRA,
        ):
            chunks.append(chunk)
            yield ('delta', {'channel': 'summary', 'text': chunk})
        summary = ''.join(chunks)
        yield ('phase', {'name': 'summary_done', 'len': len(summary)})

        yield ('result', {**point, 'chart_png_b64': chart, 'summary': summary})

    return StreamingResponse(stream_phases(gen()), media_type='text/event-stream')
