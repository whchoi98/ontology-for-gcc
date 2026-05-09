import IngestPanel from '../../components/IngestPanel';
import GuardrailPanel from '../../components/GuardrailPanel';
import MemoryPanel from '../../components/MemoryPanel';
import EvalPanel from '../../components/EvalPanel';
import TracePanel from '../../components/TracePanel';
import DataSourceBadge from '../../components/DataSourceBadge';

export default function OpsPage() {
  return (
    <div className='p-8 max-w-7xl mx-auto'>
      <h1 className='text-2xl font-bold mb-2'>운영 콘솔 (Plan 5)</h1>
      <p className='text-sm text-slate-500 mb-3'>
        적재 카운트 · 가드레일 위반 · 메모리 · 평가 · 트레이스를 한 화면에서 모니터링합니다.
      </p>
      <div className='flex gap-2 mb-4'>
        <DataSourceBadge source='real'/>
        <DataSourceBadge source='synthetic'/>
        <DataSourceBadge source='external'/>
      </div>
      <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
        <IngestPanel/>
        <EvalPanel/>
        <GuardrailPanel/>
        <MemoryPanel/>
        <div className='md:col-span-2'><TracePanel/></div>
      </div>
    </div>
  );
}
