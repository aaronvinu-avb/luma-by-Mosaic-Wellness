/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, ReactNode } from 'react';
import { CHANNELS } from '@/lib/mockData';

export type PlanningPeriod = '1m' | '1q' | '6m' | '1y' | 'custom';
export type PlanningMode   = 'conservative' | 'target' | 'aggressive';

/**
 * Canonical starting monthly budget for the Mix Optimiser.
 *
 * This is a PRODUCT-LEVEL CONSTANT (₹50,00,000 = ₹50L / month, ₹6Cr annual)
 * — not a historical average. Every page that needs a "what if the user
 * hasn't typed anything yet" fallback should import this constant rather
 * than hardcoding a literal or deriving from historical spend.
 *
 * Channel allocation defaults (historical share of spend) are applied in
 * `useOptimizerModel` once training data is available — not here.
 */
export const DEFAULT_MONTHLY_BUDGET = 5_000_000;

interface OptimizerState {
  // Planning inputs (shared across all 5 pages)
  budget: number;
  setBudget: (v: number | ((prev: number) => number)) => void;

  planningPeriod: PlanningPeriod;
  setPlanningPeriod: (v: PlanningPeriod) => void;

  planningMode: PlanningMode;
  setPlanningMode: (v: PlanningMode) => void;

  customStartMonth: string;
  setCustomStartMonth: (v: string) => void;

  customEndMonth: string;
  setCustomEndMonth: (v: string) => void;

  // Manual allocation weights (normalized fractions, sum to 1)
  allocations: Record<string, number>;
  setAllocations: (v: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => void;

  // Paused / disabled channels
  paused: Set<string>;
  setPaused: (v: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
}

const OptimizerContext = createContext<OptimizerState | undefined>(undefined);

/** Equal 1/N shares — only used as a computation fallback when allocations are unset. */
export const DEFAULT_EQUAL_ALLOC: Record<string, number> = Object.fromEntries(
  CHANNELS.map((ch) => [ch, 1 / CHANNELS.length]),
);

export function OptimizerProvider({ children }: { children: ReactNode }) {
  const [budget, setBudget]                         = useState(DEFAULT_MONTHLY_BUDGET);
  const [planningPeriod, setPlanningPeriod]         = useState<PlanningPeriod>('1y');
  const [planningMode, setPlanningMode]             = useState<PlanningMode>('target');
  const [customStartMonth, setCustomStartMonth]     = useState('2025-01');
  const [customEndMonth, setCustomEndMonth]         = useState('2025-12');
  /** Starts empty; `useOptimizerModel` seeds from historical dataset shares once baselines load. */
  const [allocations, setAllocations]               = useState<Record<string, number>>({});
  const [paused, setPaused]                         = useState<Set<string>>(new Set());

  return (
    <OptimizerContext.Provider value={{
      budget, setBudget,
      planningPeriod, setPlanningPeriod,
      planningMode, setPlanningMode,
      customStartMonth, setCustomStartMonth,
      customEndMonth, setCustomEndMonth,
      allocations, setAllocations,
      paused, setPaused,
    }}>
      {children}
    </OptimizerContext.Provider>
  );
}

export function useOptimizer() {
  const ctx = useContext(OptimizerContext);
  if (!ctx) throw new Error('useOptimizer must be used within an OptimizerProvider');
  return ctx;
}
