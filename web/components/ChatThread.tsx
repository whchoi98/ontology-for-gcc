'use client';

/** Plan 3 Task 3.4.4 — chat thread bubble list. */
type Msg = { role: 'user' | 'assistant'; text: string };

export default function ChatThread({ messages }: { messages: Msg[] }) {
  return (
    <div className="border rounded p-3 h-[480px] overflow-y-auto bg-white space-y-2">
      {messages.map((m, i) => (
        <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div
            className={`max-w-[80%] px-3 py-2 rounded text-sm ${
              m.role === 'user' ? 'bg-blue-100' : 'bg-slate-100'
            }`}
          >
            <div className="font-mono text-xs text-slate-400 mb-1">{m.role}</div>
            <div className="whitespace-pre-wrap">{m.text}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
