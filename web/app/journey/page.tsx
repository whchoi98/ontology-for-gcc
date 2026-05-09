// web/app/journey/page.tsx — 시나리오 M: 고객 통합 여정 timeline (PDF 3 시그니처)
'use client';
import { useState } from 'react';
import JourneyTimeline from '../../components/JourneyTimeline';
import PersonaSwitchGcc from '../../components/PersonaSwitchGcc';
import DataSourceBadge from '../../components/DataSourceBadge';

type JourneyEvent = {
  source?: string;
  ts?: string;
  event?: string;
  detail?: string;
};

type Transition = {
  ts?: string;
  from?: string;
  to?: string;
};

type JourneyOut = {
  cust_id?: string;
  profile?: Record<string, unknown> & { '~properties'?: Record<string, unknown> };
  events?: JourneyEvent[];
  event_count?: number;
  fuel_grade_transitions?: Transition[];
  note?: string;
};

export default function JourneyPage() {
  const [persona, setPersona] = useState('marketing');
  const [cid, setCid] = useState('');
  const [out, setOut] = useState<JourneyOut | null>(null);
  const [loading, setLoading] = useState(false);
  async function go() {
    if (!cid.trim()) return;
    setLoading(true);
    const r = await fetch('/api/journey', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cust_id: cid, persona_id: persona }),
    });
    setOut((await r.json()) as JourneyOut);
    setLoading(false);
  }
  const profileEntries = Object.entries(
    (out?.profile?.['~properties'] as Record<string, unknown>) ||
      out?.profile ||
      {},
  ).slice(0, 12);
  return (
    <div className='p-8 max-w-6xl mx-auto'>
      <h1 className='text-2xl font-bold mb-2'>M. 고객 통합 여정</h1>
      <p className='text-sm text-slate-600 mb-3'>
        PDF 3페이지: App + 거래 + 약관 + 쿠폰 시계열 통합 view + 유종 전환 강조.
      </p>
      <PersonaSwitchGcc value={persona} onChange={setPersona} />
      <div className='flex gap-2 mt-3 mb-3'>
        <DataSourceBadge source='real' />
        <DataSourceBadge source='synthetic' />
      </div>
      <div className='flex gap-2 mb-3'>
        <input
          className='flex-1 border rounded px-3 py-2'
          placeholder='cust_id'
          value={cid}
          onChange={(e) => setCid(e.target.value)}
        />
        <button
          onClick={go}
          disabled={loading}
          className='bg-blue-600 text-white px-4 py-2 rounded'
        >
          {loading ? '조회 중...' : '여정 조회'}
        </button>
      </div>
      {out && (
        <div className='grid grid-cols-3 gap-4'>
          <div className='col-span-1 border rounded p-3 text-sm space-y-1'>
            <div className='font-semibold mb-2'>프로필</div>
            {profileEntries.length === 0 && (
              <div className='text-slate-400 text-xs'>
                Customer 미발견 (cust_id 확인)
              </div>
            )}
            {profileEntries.map(([k, v]) => (
              <div key={k} className='flex gap-2 text-xs'>
                <span className='font-mono text-slate-500'>{k}:</span>
                <span className='break-all'>{String(v)}</span>
              </div>
            ))}
            <div className='border-t pt-2 mt-2'>
              <div className='font-semibold'>
                유종 전환 ({out.fuel_grade_transitions?.length ?? 0})
              </div>
              {out.fuel_grade_transitions?.map((t, i) => (
                <div key={i} className='text-xs'>
                  {t.ts}: {t.from} →{' '}
                  <span className='font-bold'>{t.to}</span>
                </div>
              ))}
            </div>
          </div>
          <div className='col-span-2 border rounded p-3 max-h-[600px] overflow-y-auto'>
            <JourneyTimeline
              events={out.events || []}
              transitions={out.fuel_grade_transitions || []}
            />
          </div>
        </div>
      )}
    </div>
  );
}
