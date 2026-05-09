'use client';
import { useEffect, useState } from 'react';
import CytoscapeView from '../../components/CytoscapeView';
import DataSourceBadge from '../../components/DataSourceBadge';

type Tab = 'er' | 'standards' | 'validation';

export default function MetaPage() {
  const [tab, setTab] = useState<Tab>('er');
  const [schema, setSchema] = useState<any>(null);
  const [standards, setStandards] = useState<any>(null);
  const [validation, setValidation] = useState<any>(null);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
    fetch(`${base}/ontology/schema`).then((r) => r.json()).then(setSchema).catch(() => {});
    fetch(`${base}/ontology/standards`).then((r) => r.json()).then(setStandards).catch(() => {});
    fetch(`${base}/ontology/validation`).then((r) => r.json()).then(setValidation).catch(() => {});
  }, []);

  // Group classes for color coding (best-effort by name keyword).
  const groupOf = (name: string): string => {
    if (['Customer','Persona','Cluster','Segment','Member'].includes(name)) return 'customer';
    if (['FuelTransaction','AppEvent','SurveyResponse','CouponUse','PaymentMethod'].includes(name)) return 'behavior';
    if (['Campaign','Coupon','Offer','Channel','CampaignSms','CampaignAggregation'].includes(name)) return 'marketing';
    if (['FuelProduct','GasStation','FuelPrice','Region'].includes(name)) return 'operations';
    if (['Term','TermAgreement','ConsumptionIndex','WeatherObservation'].includes(name)) return 'compliance_external';
    return 'time';
  };

  const elements = schema?.classes
    ? [
        ...schema.classes.map((c: any) => ({
          data: { id: c.name, label: c.name, group: groupOf(c.name) },
        })),
        ...schema.relations.map((r: any) => ({
          data: {
            id: `${r.source}-${r.edge}-${r.target}`,
            source: r.source,
            target: r.target,
            edge: r.edge,
          },
        })),
      ]
    : [];

  return (
    <div className='p-8 max-w-6xl mx-auto'>
      <h1 className='text-2xl font-bold mb-2'>Ontology Meta</h1>
      <div className='flex gap-2 mb-4'>
        <DataSourceBadge source='real'/>
        <DataSourceBadge source='synthetic'/>
        <DataSourceBadge source='external'/>
      </div>
      <div className='flex gap-2 border-b mb-4'>
        {(['er','standards','validation'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 ${
              tab === t ? 'border-b-2 border-blue-600 font-semibold' : 'text-slate-500'
            }`}
          >
            {t === 'er' ? 'ER 다이어그램' : t === 'standards' ? '표준 코드' : '검증 리포트'}
          </button>
        ))}
      </div>

      {tab === 'er' && schema && (
        <>
          <div className='text-sm mb-2'>
            클래스 <b>{schema.class_count}</b> · 관계 <b>{schema.relation_count}</b>
          </div>
          <CytoscapeView elements={elements}/>
        </>
      )}

      {tab === 'standards' && standards && (
        <pre className='border rounded p-3 bg-slate-50 text-xs overflow-auto max-h-[600px]'>
          {JSON.stringify(standards, null, 2)}
        </pre>
      )}

      {tab === 'validation' && validation && (
        <div>
          <div
            className={`mb-3 px-3 py-2 rounded text-sm ${
              validation.all_ok ? 'bg-emerald-100' : 'bg-rose-100'
            }`}
          >
            전체: <b>{validation.all_ok ? '✓ 정상' : '✗ 일부 미달 또는 미연결'}</b>
          </div>
          <table className='w-full text-sm border-collapse'>
            <thead>
              <tr className='border-b'>
                <th className='text-left py-1'>클래스</th>
                <th className='text-right py-1'>실제</th>
                <th className='text-right py-1'>min</th>
                <th className='text-right py-1'>max</th>
                <th className='text-center py-1'>상태</th>
              </tr>
            </thead>
            <tbody>
              {validation.checks?.map((c: any, i: number) => (
                <tr key={i} className='border-b'>
                  <td className='py-1'>{c.class}</td>
                  <td className='text-right font-mono'>
                    {typeof c.count === 'number' ? c.count.toLocaleString() : c.count}
                  </td>
                  <td className='text-right text-slate-500'>{c.expected_min?.toLocaleString?.()}</td>
                  <td className='text-right text-slate-500'>{c.expected_max?.toLocaleString?.()}</td>
                  <td className='text-center'>{c.ok ? '✓' : '✗'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
