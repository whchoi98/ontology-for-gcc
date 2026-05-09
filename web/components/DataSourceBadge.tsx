type Source = 'real' | 'synthetic' | 'external';
const COLORS: Record<Source, string> = {
  real:      'bg-emerald-100 text-emerald-800 border-emerald-300',
  synthetic: 'bg-amber-100   text-amber-800   border-amber-300',
  external:  'bg-sky-100     text-sky-800     border-sky-300',
};
const LABELS: Record<Source, string> = {
  real: '실 데이터', synthetic: '합성', external: '외부 API',
};
export default function DataSourceBadge({ source }: { source: Source }) {
  return (
    <span className={`inline-block px-2 py-0.5 text-xs border rounded ${COLORS[source]}`}>
      {LABELS[source]}
    </span>
  );
}
