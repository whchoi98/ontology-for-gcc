// web/app/cluster/page.tsx — 시나리오 E: 고객 클러스터링 (KMeans 6 + LLM 라벨링)
'use client';
import { useState } from 'react';
import { streamSSE } from '../../lib/api-client';
import ChartImage from '../../components/ChartImage';
import PersonaSwitchGcc from '../../components/PersonaSwitchGcc';
import DataSourceBadge from '../../components/DataSourceBadge';

type ResultData = {
  chart_png_b64?: string;
  labels?: string[];
  centroids?: number[][];
  assignments?: { cust_id: string; cluster: number }[];
};

export default function ClusterPage() {
  const [persona, setPersona] = useState('data-ai');
  const [chart, setChart] = useState<string | undefined>();
  const [labels, setLabels] = useState<string[]>([]);
  const [wb, setWb] = useState(false);
  const [loading, setLoading] = useState(false);
  async function go() {
    setLoading(true);
    setChart(undefined);
    setLabels([]);
    for await (const ev of streamSSE<unknown>('/api/cluster/stream', {
      persona_id: persona,
      write_back: wb,
    })) {
      if (ev.type === 'result') {
        const d = ev.data as ResultData;
        setChart(d.chart_png_b64);
        setLabels(d.labels || []);
      }
    }
    setLoading(false);
  }
  return (
    <div className='p-8 max-w-6xl mx-auto'>
      <h1 className='text-2xl font-bold mb-2'>
        E. 고객 클러스터링 (K-Means 6 + LLM 라벨링)
      </h1>
      <PersonaSwitchGcc value={persona} onChange={setPersona} />
      <div className='flex gap-2 mt-3 mb-3'>
        <DataSourceBadge source='real' />
        <DataSourceBadge source='synthetic' />
      </div>
      <label className='flex items-center gap-2 mb-3'>
        <input
          type='checkbox'
          checked={wb}
          onChange={(e) => setWb(e.target.checked)}
        />
        Cluster 노드에 결과 write-back
      </label>
      <button
        onClick={go}
        disabled={loading}
        className='bg-blue-600 text-white px-4 py-2 rounded'
      >
        {loading ? '클러스터링 중...' : '클러스터 생성'}
      </button>
      <div className='grid grid-cols-2 gap-4 mt-4'>
        <ChartImage base64Png={chart} loading={loading} />
        <div className='border rounded p-3'>
          <div className='font-semibold mb-2'>6 클러스터 라벨</div>
          {labels.length === 0 && (
            <div className='text-slate-400 text-sm'>라벨 대기</div>
          )}
          {labels.map((l, i) => (
            <div key={i} className='py-1 border-b'>
              cl-{i + 1}: <span className='font-semibold'>{l}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
