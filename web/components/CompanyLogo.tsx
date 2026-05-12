'use client';

// Sidebar company-logo. GCC PoC default = GS Caltex 공식 로고.
// Plan 1 ~ 5에서 다른 데모 시 cycle하던 마법사 동작은 제거하고 fixed 표시로 단순화.

export function CompanyLogo() {
  return (
    <span
      title="GS Caltex"
      aria-label="GS Caltex"
      className="shrink-0 h-9 px-2 rounded-md bg-white flex items-center justify-center overflow-hidden ring-1 ring-white/10"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logos/gs-caltex.png"
        alt="GS Caltex"
        className="max-h-7 w-auto object-contain"
      />
    </span>
  );
}
