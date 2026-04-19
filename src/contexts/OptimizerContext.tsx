/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, ReactNode, useMemo } from 'react';
import { CHANNELS } from '@/lib/mockData';
import { buildMonthRange, planningDurationMonths } from '@/lib/optimizer/planningRange';
import type { MonthPoint } from '@/lib/calculations';

export type PlanningPeriod = '1m' | '1q' | '6m' | '1y' | 'custom';
/** `target` = Base mode in the UI (moderate exploration toward efficiency). */
export type PlanningMode = 'conservative' | 'target' | 'aggressive';

/**
 * Canonical starting monthly budget for the Mix Optimiser.
 * Product default ₹50,00,000 / month — used only when input is empty/invalid.
 */
export const DEFAULT_MONTHLY_BUDGET = 5_000_000;

interface OptimizerState {
  /** Master input 1: monthly budget (₹) — same value surfaced as `monthlyBudget` in `useOptimizerModel`. */
  monthlyBudget: number;
  setMonthlyBudget: (v: number | ((prev: number) => number)) => void;

  planningPeriod: PlanningPeriod;
  setPlanningPeriod: (v: PlanningPeriod) => void;

  planningMode: PlanningMode;
  setPlanningMode: (v: PlanningMode) => void;

  customStartMonth: string;
  setCustomStartMonth: (v: string) => void;

  customEndMonth: string;
  setCustomEndMonth: (v: string) => void;

  /**
   * Master input 4: per-channel allocation **shares** (0–1, sum to 1).
   * UI shows percentages; all forecasts multiply share × monthlyBudget for spend.
   */
  allocations: Record<string, number>;
  setAllocations: (v: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => void;

  paused: Set<string>;
  setPaused: (v: Set<string> | ((prev: Set<string>) => Set<string>)) => void;

  /** Months covered by the selected planning window (1, 3, 6, 12, or custom span). */
  durationMonths: number;
  /** monthlyBudget × durationMonths (uses safe monthly value). */
  totalPeriodBudget: number;
  selectedRange: MonthPoint[];
}

const OptimizerContext = createContext<OptimizerState | undefined>(undefined);

/** Equal 1/N shares — fallback when allocations are unset. */
export const DEFAULT_EQUAL_ALLOC: Record<string, number> = Object.fromEntries(
  CHANNELS.map((ch) => [ch, 1 / CHANNELS.length]),
);

export function OptimizerProvider({ children }: { children: ReactNode }) {
  const [monthlyBudget, setMonthlyBudget] = useState(DEFAULT_MONTHLY_BUDGET);
  const [planningPeriod, setPlanningPeriod] = useState<PlanningPeriod>('1m');
  const [planningMode, setPlanningMode] = useState<PlanningMode>('target');
  const [customStartMonth, setCustomStartMonth] = useState('2025-01');
  const [customEndMonth, setCustomEndMonth] = useState('2025-12');
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [paused, setPaused] = useState<Set<string>>(new Set());

  const selectedRange = useMemo(
    () => buildMonthRange(planningPeriod, customStartMonth, customEndMonth),
    [planningPeriod, customStartMonth, customEndMonth],
  );

  const durationMonths = useMemo(
    () => planningDurationMonths(planningPeriod, customStartMonth, customEndMonth),
    [planningPeriod, customStartMonth, customEndMonth],
  );

  const totalPeriodBudget = useMemo(() => {
    const safe =
      Number.isFinite(monthlyBudget) && monthlyBudget > 0 ? monthlyBudget : DEFAULT_MONTHLY_BUDGET;
    return safe * durationMonths;
  }, [monthlyBudget, durationMonths]);

  return (
    <OptimizerContext.Provider
      value={{
        monthlyBudget,
        setMonthlyBudget,
        planningPeriod,
        setPlanningPeriod,
        planningMode,
        setPlanningMode,
        customStartMonth,
        setCustomStartMonth,
        customEndMonth,
        setCustomEndMonth,
        allocations,
        setAllocations,
        paused,
        setPaused,
        durationMonths,
        totalPeriodBudget,
        selectedRange,
      }}
    >
      {children}
    </OptimizerContext.Provider>
  );
}

export function useOptimizer() {
  const ctx = useContext(OptimizerContext);
  if (!ctx) throw new Error('useOptimizer must be used within an OptimizerProvider');
  return ctx;
}
