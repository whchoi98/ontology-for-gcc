"use client";

// PersonaContext — global "active persona" for the GCC demo.
// 5 부서 (마케팅/고객전략/데이터·AI/CRM·회원사업/리테일영업).
// PersonaSwitch in the topbar writes; scenario pages read.
// Backed by localStorage so choice survives reload.

import { createContext, useContext, useEffect, useState } from "react";
import type { Persona } from "./types";

const STORAGE_KEY = "ontology-gcc.active-persona";
const VALID: Persona[] = ["marketing", "strategy", "data-ai", "crm", "retail-ops"];

interface Ctx {
  active: Persona;
  setActive: (p: Persona) => void;
}

const PersonaContext = createContext<Ctx>({ active: "marketing", setActive: () => {} });

export function PersonaProvider({ children }: { children: React.ReactNode }) {
  const [active, setActiveState] = useState<Persona>("marketing");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw && (VALID as string[]).includes(raw)) {
        setActiveState(raw as Persona);
      }
    } catch {
      // ignore
    }
  }, []);

  const setActive = (p: Persona) => {
    setActiveState(p);
    try { localStorage.setItem(STORAGE_KEY, p); } catch { /* ignore */ }
  };

  return (
    <PersonaContext.Provider value={{ active, setActive }}>
      {children}
    </PersonaContext.Provider>
  );
}

export function useActivePersona(): Ctx {
  return useContext(PersonaContext);
}
