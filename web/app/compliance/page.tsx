// web/app/compliance/page.tsx — 시나리오 I: 약관·규제 가드레일
'use client';
import { useState } from 'react';
import DataSourceBadge from '../../components/DataSourceBadge';
import PersonaSwitchGcc from '../../components/PersonaSwitchGcc';

type CheckOut = {
  action_cleaned?: string;
  guardrail_violations?: string[];
  eligible_count?: number;
  blocked_count?: number;
  eligible_sample?: string[];
  blocked_sample?: string[];
  recommendation?: string;
};

export default function CompliancePage() {
  const [persona, setPersona] = useState('strategy');
  const [csv, setCsv] = useState('c001,c002,c003');
  const [action, setAction] = useState('고급휘발유 충성 고객 대상 SMS 캠페인');
  const [out, setOut] = useState<CheckOut | null>(null);
  const [loading, setLoading] = useState(false);
  async function go() {
    setLoading(true);
    const r = await fetch('/api/compliance/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_cust_ids: csv.split(',').map((s) => s.trim()),
        marketing_action: action,
        persona_id: persona,
      }),
    });
    setOut((await r.json()) as CheckOut);
    setLoading(false);
  }
  return (
    <div className='p-8 max-w-5xl mx-auto'>
      <h1 className='text-2xl font-bold mb-2'>I. 약관 · 규제 가드레일</h1>
      <PersonaSwitchGcc value={persona} onChange={setPersona} />
      <div className='flex gap-2 mt-3 mb-2'>
        <DataSourceBadge source='real' />
        <DataSourceBadge source='synthetic' />
      </div>
      <textarea
        className='w-full border rounded p-2 mb-2'
        rows={2}
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        placeholder='cust_ids (쉼표 구분)'
      />
      <input
        className='w-full border rounded p-2 mb-2'
        value={action}
        onChange={(e) => setAction(e.target.value)}
        placeholder='마케팅 액션 설명'
      />
      <button
        onClick={go}
        disabled={loading}
        className='bg-blue-600 text-white px-4 py-2 rounded'
      >
        {loading ? '검사 중...' : '검사'}
      </button>
      {out && (
        <div className='mt-4 border rounded p-3 grid grid-cols-2 gap-3'>
          <div className='border rounded p-2 bg-emerald-50'>
            <div className='font-semibold'>적격 (마케팅 가능)</div>
            <div className='text-2xl font-bold'>{out.eligible_count ?? 0}</div>
            <div className='text-xs font-mono'>
              {out.eligible_sample?.join(', ')}
            </div>
          </div>
          <div className='border rounded p-2 bg-rose-50'>
            <div className='font-semibold'>차단</div>
            <div className='text-2xl font-bold'>{out.blocked_count ?? 0}</div>
            <div className='text-xs font-mono'>
              {out.blocked_sample?.join(', ')}
            </div>
          </div>
          <div className='col-span-2 border-t pt-2'>
            <div className='text-sm'>
              가드레일 위반: {out.guardrail_violations?.length ?? 0}
            </div>
            <div className='font-semibold mt-1'>
              권고: {out.recommendation}
            </div>
            {out.action_cleaned && out.action_cleaned !== action && (
              <div className='text-xs mt-2 text-amber-700'>
                cleaned: {out.action_cleaned}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
