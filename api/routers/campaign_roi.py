# api/routers/campaign_roi.py — 시나리오 G: 캠페인 ROI 시뮬레이터 + Bayesian 분포 차트
from __future__ import annotations
import base64
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from api.services.tools.campaign_simulator import run as sim_run
from api.services.code_interpreter import execute as ci_execute

router = APIRouter(prefix='/api/campaign-roi', tags=['campaign_roi'])


class RoiRequest(BaseModel):
    coupon_amt: int = 1000
    target_segment_id: str = 'seg-001'
    duration_days: int = 30
    persona_id: Optional[str] = 'marketing'


def _render_distribution_chart(mu: float) -> str:
    """matplotlib normal-distribution PNG → base64."""
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
    out = ci_execute(code)
    if out.get('images'):
        return base64.b64encode(out['images'][0]).decode()
    return ''


@router.post('')
def simulate(req: RoiRequest) -> dict:
    point = sim_run(
        req.model_dump(),
        persona_id=req.persona_id or 'marketing',
        session_id='web',
        cust_id=None,
    )
    chart = _render_distribution_chart(float(point.get('projected_conversion', 0.0)))
    return {**point, 'chart_png_b64': chart}
