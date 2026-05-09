'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import DataSourceBadge from '../../../components/DataSourceBadge';

export default function ObjectsTypePage({ params }: { params: { type: string } }) {
  const [items, setItems] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const base = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
    const url = q
      ? `${base}/objects/${params.type}/search?q=${encodeURIComponent(q)}`
      : `${base}/objects/${params.type}?page=${page}&size=50`;
    try {
      const r = await fetch(url);
      const d = await r.json();
      setItems(d.items || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [params.type, page]);

  return (
    <div className='p-8 max-w-6xl mx-auto'>
      <h1 className='text-2xl font-bold capitalize mb-2'>{params.type}</h1>
      <div className='flex gap-2 mb-3'>
        <DataSourceBadge source='real'/>
        <DataSourceBadge source='synthetic'/>
        <DataSourceBadge source='external'/>
      </div>
      <div className='flex gap-2 mb-3'>
        <input
          className='flex-1 border rounded px-3 py-2 text-sm'
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); load(); } }}
          placeholder='검색 (속성 텍스트 contains — Plan 5)'
        />
        <button
          onClick={() => { setPage(1); load(); }}
          disabled={loading}
          className='bg-blue-600 text-white px-4 py-2 rounded text-sm disabled:opacity-60'
        >
          {loading ? '...' : '검색'}
        </button>
      </div>
      <div className='text-xs text-slate-500 mb-2'>
        {items.length} 행 · {q ? '검색 결과' : `page ${page}`}
      </div>
      <table className='w-full border-collapse text-sm'>
        <tbody>
          {items.map((n: any, i: number) => {
            const props = n['~properties'] || n;
            const id = props.cust_id || props.opinet_no || props.campaign_cd
              || props.tx_id || props.id_key || `row-${i}`;
            return (
              <tr key={i} className='border-b hover:bg-slate-50'>
                <td className='py-1 px-2 font-mono text-xs text-slate-400 w-10'>
                  {i + 1 + (q ? 0 : (page - 1) * 50)}
                </td>
                <td className='py-1 px-2 w-40'>
                  <Link
                    href={`/objects/${params.type}/${id}`}
                    className='text-blue-600 hover:underline font-mono text-xs'
                  >
                    {String(id)}
                  </Link>
                </td>
                <td className='py-1 px-2 text-xs text-slate-600 truncate'>
                  {JSON.stringify(props).slice(0, 200)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!q && (
        <div className='flex gap-2 mt-3 items-center'>
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className='border rounded px-3 py-1 text-sm disabled:opacity-50'
          >
            이전
          </button>
          <span className='text-sm'>page {page}</span>
          <button
            onClick={() => setPage(page + 1)}
            className='border rounded px-3 py-1 text-sm'
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}
