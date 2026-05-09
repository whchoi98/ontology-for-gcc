import CytoscapeView from '../../components/CytoscapeView';
import DataSourceBadge from '../../components/DataSourceBadge';

const CLASSES_BY_GROUP = {
  customer:            ['Customer','Persona','Cluster','Segment','Member'],
  behavior:            ['FuelTransaction','AppEvent','SurveyResponse','CouponUse','PaymentMethod'],
  marketing:           ['Campaign','Coupon','Offer','Channel','CampaignSms','CampaignAggregation'],
  operations:          ['FuelProduct','GasStation','FuelPrice','Region'],
  compliance_external: ['Term','TermAgreement','ConsumptionIndex','WeatherObservation'],
  time:                ['TimeSlot'],
};

const EDGES: Array<[string,string,string]> = [
  ['Customer','HAS_PERSONA','Persona'], ['Customer','BELONGS_TO','Cluster'],
  ['Customer','REFUELED','FuelTransaction'], ['FuelTransaction','AT','GasStation'],
  ['FuelTransaction','OF','FuelProduct'], ['FuelTransaction','VIA','PaymentMethod'],
  ['Campaign','HAS_OFFER','Offer'], ['Offer','ISSUES','Coupon'],
  ['Coupon','REDEEMED_AS','CouponUse'], ['Campaign','SENT_SMS','CampaignSms'],
  ['Campaign','AGGREGATED_AS','CampaignAggregation'],
  ['Region','OBSERVED_WEATHER','WeatherObservation'],
  // ... (전체 31 edges는 ontology/relations/edges.yaml에서 가져오게 Plan 5에서 동적화)
];

export default function MetaPage() {
  const elements: any[] = [];
  for (const [group, names] of Object.entries(CLASSES_BY_GROUP)) {
    for (const n of names) {
      elements.push({ data: { id: n, label: n, group }});
    }
  }
  for (const [s,e,t] of EDGES) {
    elements.push({ data: { id: `${s}-${e}-${t}`, source: s, target: t, edge: e }});
  }
  return (
    <div className='p-8'>
      <h1 className='text-2xl font-bold'>Ontology ER (25 클래스)</h1>
      <div className='flex gap-2 my-3'>
        <DataSourceBadge source='real'/><DataSourceBadge source='synthetic'/><DataSourceBadge source='external'/>
      </div>
      <CytoscapeView elements={elements}/>
    </div>
  );
}
