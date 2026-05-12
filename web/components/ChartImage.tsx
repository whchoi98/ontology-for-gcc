'use client';
type Props = { base64Png?: string; alt?: string; loading?: boolean };
export default function ChartImage({ base64Png, alt = '차트', loading }: Props) {
  if (loading) {
    return <div className='h-72 rounded-lg border border-ink-700 bg-ink-800 animate-pulse' />;
  }
  if (!base64Png) {
    return (
      <div className='h-72 rounded-lg border border-dashed border-ink-700 bg-ink-900 grid place-items-center text-sm text-ink-500'>
        차트 대기
      </div>
    );
  }
  return (
    <img
      src={`data:image/png;base64,${base64Png}`}
      alt={alt}
      className='rounded-lg border border-ink-700 max-w-full bg-white p-2'
    />
  );
}
