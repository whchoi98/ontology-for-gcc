// web/app/campaign-roi/page.tsx — 시나리오 G: 캠페인 ROI 시뮬레이터
'use client';
import { useState } from 'react';
import ChartImage from '../../components/ChartImage';
import PersonaSwitchGcc from '../../components/PersonaSwitchGcc';
import DataSourceBadge from '../../components/DataSourceBadge';

type RoiOut = {
  projected_conversion?: number;
  baseline_roi_pct?: number;
  note?: string;
  chart_png_b64?: string;
  segment_id?: string;
  coupon_amt?: number;
  duration_days?: number;
};

export default function CampaignRoiPage() {
  const [persona, setPersona] = useState('marketing');
  const [amt, setAmt] = useState(1000);
  const [seg, setSeg] = useState('seg-001');
  const [days, setDays] = useState(30);
  const [out, setOut] = useState<RoiOut | null>(null);
  const [loading, setLoading] = useState(false);
  async function go() {
    setLoading(true);
    const r = await fetch('/api/campaign-roi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        coupon_amt: amt,
        target_segment_id: seg,
        duration_days: days,
        persona_id: persona,
      }),
    });
    setOut((await r.json()) as RoiOut);
    setLoading(false);
  }
  return (
    <div className='p-8 max-w-6xl mx-auto'>
      <h1 className='text-2xl font-bold mb-2'>G. 캠페인 ROI 시뮬레이터</h1>
      <PersonaSwitchGcc value={persona} onChange={setPersona} />
      <div className='flex gap-2 mt-3 mb-3'>
        <DataSourceBadge source='synthetic' />
        <DataSourceBadge source='real' />
      </div>
      <div className='flex gap-2 mb-3 items-end flex-wrap'>
        <label className='block'>
          쿠폰액
          <input
            type='number'
            value={amt}
            onChange={(e) => setAmt(parseInt(e.target.value, 10))}
            className='border rounded px-2 w-24 ml-1'
          />
        </label>
        <label className='block'>
          세그먼트
          <input
            value={seg}
            onChange={(e) => setSeg(e.target.value)}
            className='border rounded px-2 ml-1'
          />
        </label>
        <label className='block'>
          기간(일)
          <input
            type='number'
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10))}
            className='border rounded px-2 w-20 ml-1'
          />
        </label>
        <button
          onClick={go}
          disabled={loading}
          className='bg-blue-600 text-white px-4 py-2 rounded'
        >
          {loading ? '시뮬레이션 중...' : '시뮬'}
        </button>
      </div>
      {out && (
        <div className='grid grid-cols-2 gap-4'>
          <div className='border rounded p-3 space-y-1'>
            <div>
              예상 전환률:{' '}
              <span className='font-bold'>
                {((out.projected_conversion ?? 0) * 100).toFixed(2)}%
              </span>
            </div>
            <div>
              baseline ROI:{' '}
              <span className='font-bold'>{out.baseline_roi_pct ?? 0}%</span>
            </div>
            <div className='text-xs text-slate-500'>{out.note}</div>
          </div>
          <ChartImage base64Png={out.chart_png_b64} />
        </div>
      )}
    </div>
  );
}
