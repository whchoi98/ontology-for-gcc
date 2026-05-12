'use client';

/** 루트 layout의 사이드바·top-bar·FloatingChat을 경로별로 조건부 렌더링.
 *  /cally — 챗 전용 popup 창에서는 사이드바·플로팅 챗봇 모두 숨김 (clean chat UI).
 *  나머지 — 기본 3-zone (sidebar + 메인 컨텐츠 + 플로팅).
 */
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { PersonaSwitch } from './PersonaSwitch';
import { GuidedTour } from './GuidedTour';
import FloatingChat from './FloatingChat';

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/';
  const isPopup = pathname === '/cally' || pathname.startsWith('/cally/');

  if (isPopup) {
    // 사이드바·top-bar·플로팅 모두 없는 minimal shell. 챗 전용 popup 창에 적합.
    return <>{children}</>;
  }

  return (
    <>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="flex items-center justify-end gap-3 px-6 h-12 bg-ink-950/85 backdrop-blur border-b border-ink-800/60 shrink-0">
            <GuidedTour />
            <PersonaSwitch />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
            {children}
          </div>
        </main>
      </div>
      <FloatingChat />
    </>
  );
}
