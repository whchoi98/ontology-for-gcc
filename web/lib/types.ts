// GCC M&M본부 5 부서 페르소나 (PERSONA_REGISTRY SSOT와 일치).
// PersonaContext / PersonaSwitch가 이 타입을 참조한다.
export type Persona =
  | 'marketing'
  | 'strategy'
  | 'data-ai'
  | 'crm'
  | 'retail-ops';

export interface CytoscapeGraph {
  nodes: { data: { id: string; label?: string; [k: string]: unknown } }[];
  edges: { data: { id: string; source: string; target: string; type?: string } }[];
}
