import { Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/Layout";
import { LandingPage } from "@/components/LandingPage";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AppProvider } from "@/contexts/AppContext";
const Overview = lazy(() => import("@/pages/Overview"));
const ChannelPerformance = lazy(() => import("@/pages/ChannelPerformance"));
const MixOptimizer = lazy(() => import("@/pages/MixOptimizer"));
const TrendAnalysis = lazy(() => import("@/pages/TrendAnalysis"));
const ScenarioPlanner = lazy(() => import("@/pages/ScenarioPlanner"));
const FunnelAnalysis = lazy(() => import("@/pages/FunnelAnalysis"));
const FinancialInsights = lazy(() => import("@/pages/FinancialInsights"));
const DailyDigest = lazy(() => import("@/pages/DailyDigest"));
const BudgetTracker = lazy(() => import("@/pages/BudgetTracker"));
const BestDays = lazy(() => import("@/pages/BestDays"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const queryClient = new QueryClient();

const PageFallback = () => (
  <div className="flex items-center justify-center h-[calc(100vh-56px)] text-sm" style={{ color: "var(--text-secondary)" }}>
    Loading dashboard module...
  </div>
);

const App = () => (
  <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
      <Toaster />
      <Sonner />
      <AppProvider>
        <BrowserRouter>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route
              path="/dashboard"
              element={
                <Layout>
                  <Overview />
                </Layout>
              }
            />
            <Route path="/channels" element={<Layout><ChannelPerformance /></Layout>} />
            <Route path="/optimizer" element={<Layout><MixOptimizer /></Layout>} />
            <Route path="/trends" element={<Layout><TrendAnalysis /></Layout>} />
            <Route path="/scenarios" element={<Layout><ScenarioPlanner /></Layout>} />
            <Route path="/funnel" element={<Layout><FunnelAnalysis /></Layout>} />
            <Route path="/financials" element={<Layout><FinancialInsights /></Layout>} />
            <Route path="/daily-digest" element={<Layout><DailyDigest /></Layout>} />
            <Route path="/budget" element={<Layout><BudgetTracker /></Layout>} />
            <Route path="/best-days" element={<Layout><BestDays /></Layout>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
      </AppProvider>
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
);

export default App;
