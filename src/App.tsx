import { Suspense, lazy } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/Layout";
import { LandingPage } from "@/components/LandingPage";
import { ThemeProvider } from "@/components/ThemeProvider";
import { OptimizerProvider } from "@/contexts/OptimizerContext";

// ── Measurement ────────────────────────────────────────────────────────────
const Overview           = lazy(() => import("@/pages/Overview"));
const ChannelPerformance = lazy(() => import("@/pages/ChannelPerformance"));
const FunnelAnalysis     = lazy(() => import("@/pages/FunnelAnalysis"));

// ── Strategy ───────────────────────────────────────────────────────────────
const ScenarioPlanner    = lazy(() => import("@/pages/ScenarioPlanner"));

const MixOptimizer       = lazy(() => import("@/pages/MixOptimizer"));

// ── Intelligence ───────────────────────────────────────────────────────────
const FinancialInsights  = lazy(() => import("@/pages/FinancialInsights"));
const TrendAnalysis      = lazy(() => import("@/pages/TrendAnalysis"));

const NotFound           = lazy(() => import("@/pages/NotFound"));

const PageFallback = () => (
  <div className="px-8 py-6 max-w-[1280px] mx-auto">
    <DashboardSkeleton />
  </div>
);

const App = () => (
  <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
          <OptimizerProvider>
            <BrowserRouter>
              <Suspense fallback={<PageFallback />}>
                <Routes>
                  {/* Landing */}
                  <Route path="/" element={<LandingPage />} />

                  {/* Measurement */}
                  <Route path="/dashboard" element={<Layout><Overview /></Layout>} />
                  <Route path="/channels"  element={<Layout><ChannelPerformance /></Layout>} />
                  <Route path="/funnel"    element={<Layout><FunnelAnalysis /></Layout>} />

                  {/* Strategy */}
                  <Route path="/scenarios" element={<Layout><ScenarioPlanner /></Layout>} />
                  <Route path="/budget"    element={<Navigate to="/dashboard" replace />} />

                  {/* Mix Optimiser */}
                  <Route path="/optimizer" element={<Layout><MixOptimizer /></Layout>} />
                  <Route path="/optimizer/current-mix" element={<Navigate to="/optimizer" replace />} />
                  <Route path="/optimizer/diagnosis"   element={<Navigate to="/optimizer" replace />} />
                  <Route path="/optimizer/recommended" element={<Navigate to="/optimizer" replace />} />
                  <Route path="/optimizer/why"         element={<Navigate to="/optimizer" replace />} />

                  {/* Intelligence */}
                  <Route path="/financials"   element={<Layout><FinancialInsights /></Layout>} />
                  <Route path="/trends"       element={<Layout><TrendAnalysis /></Layout>} />
                  <Route path="/daily-digest" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/best-days"    element={<Navigate to="/dashboard" replace />} />

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </OptimizerProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
