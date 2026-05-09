'use client';
import { useEffect, useState } from 'react';

export default function MemoryPanel() {
  const [d, setD] = useState<any>(null);
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
    fetch(`${base}/ops/live/memory`)
      .then((r) => r.json())
      .then(setD)
      .catch(() => setD(null));
  }, []);
  return (
    <div className='border rounded p-3 bg-white'>
      <h3 className='font-semibold mb-2 text-sm'>AgentCore 메모리 스냅샷</h3>
      <pre className='text-xs bg-slate-50 p-2 rounded overflow-x-auto'>
        {d ? JSON.stringify(d, null, 2) : 'loading…'}
      </pre>
    </div>
  );
}
