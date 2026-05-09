// web/app/network-map/page.tsx — 시나리오 H: 주유소 네트워크 지도
'use client';
import { useState } from 'react';
import DataSourceBadge from '../../components/DataSourceBadge';
import PersonaSwitchGcc from '../../components/PersonaSwitchGcc';

export default function NetworkMapPage() {
  const [persona, setPersona] = useState('marketing');
  return (
    <div className='p-8 max-w-6xl mx-auto'>
      <h1 className='text-2xl font-bold mb-2'>H. 주유소 네트워크 지도</h1>
      <div className='flex items-center gap-3 mb-4'>
        <PersonaSwitchGcc value={persona} onChange={setPersona}/>
        <DataSourceBadge source='real'/><DataSourceBadge source='synthetic'/>
      </div>
      <div className='border rounded p-4 bg-slate-50'>본 시나리오는 task 4.x에서 본격 구현됩니다.</div>
    </div>
  );
}
