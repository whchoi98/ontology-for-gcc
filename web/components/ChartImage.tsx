'use client';
type Props = { base64Png?: string; alt?: string; loading?: boolean };
export default function ChartImage({ base64Png, alt = '차트', loading }: Props) {
  if (loading) {
    return <div className='h-64 border rounded animate-pulse bg-slate-100' />;
  }
  if (!base64Png) {
    return (
      <div className='h-64 border rounded grid place-items-center text-slate-400'>
        차트 대기
      </div>
    );
  }
  return (
    <img
      src={`data:image/png;base64,${base64Png}`}
      alt={alt}
      className='border rounded max-w-full bg-white'
    />
  );
}
