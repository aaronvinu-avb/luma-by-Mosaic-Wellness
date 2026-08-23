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
import { AppProvider } from "@/contexts/AppContext";
import { OptimizerProvider } from "@/contexts/OptimizerContext";

// ── Measurement ────────────────────────────────────────────────────────────
const Overview           = lazy(() => import("@/pages/Overview"));
const ChannelPerformance = lazy(() => import("@/pages/ChannelPerformance"));
const FunnelAnalysis     = lazy(() => import("@/pages/FunnelAnalysis"));

// ── Strategy ───────────────────────────────────────────────────────────────
const ScenarioPlanner    = lazy(() => import("@/pages/ScenarioPlanner"));
const BudgetTracker      = lazy(() => import("@/pages/BudgetTracker"));

// ── Mix Optimiser (4 child pages) ──────────────────────────────────────────
const CurrentMix         = lazy(() => import("@/pages/optimizer/CurrentMix"));
const Diagnosis          = lazy(() => import("@/pages/optimizer/Diagnosis"));
const RecommendedMix     = lazy(() => import("@/pages/optimizer/RecommendedMix"));
const WhyItWorks         = lazy(() => import("@/pages/optimizer/WhyItWorks"));

// ── Intelligence ───────────────────────────────────────────────────────────
const FinancialInsights  = lazy(() => import("@/pages/FinancialInsights"));
const TrendAnalysis      = lazy(() => import("@/pages/TrendAnalysis"));
const DailyDigest        = lazy(() => import("@/pages/DailyDigest"));
const BestDays           = lazy(() => import("@/pages/BestDays"));

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
        <AppProvider>
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
                  <Route path="/budget"    element={<Layout><BudgetTracker /></Layout>} />

                  {/* Mix Optimiser — /optimizer redirects to first child page */}
                  <Route path="/optimizer"             element={<Navigate to="/optimizer/current-mix" replace />} />
                  <Route path="/optimizer/current-mix" element={<Layout><CurrentMix /></Layout>} />
                  <Route path="/optimizer/diagnosis"   element={<Layout><Diagnosis /></Layout>} />
                  <Route path="/optimizer/recommended" element={<Layout><RecommendedMix /></Layout>} />
                  <Route path="/optimizer/why"         element={<Layout><WhyItWorks /></Layout>} />

                  {/* Intelligence */}
                  <Route path="/financials"   element={<Layout><FinancialInsights /></Layout>} />
                  <Route path="/trends"       element={<Layout><TrendAnalysis /></Layout>} />
                  <Route path="/daily-digest" element={<Layout><DailyDigest /></Layout>} />
                  <Route path="/best-days"    element={<Layout><BestDays /></Layout>} />

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </OptimizerProvider>
        </AppProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
