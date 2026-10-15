import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout.jsx';
import { EmptyState } from './components/StateViews.jsx';
import { AnalyticsPage } from './pages/AnalyticsPage.jsx';
import { BrowsePage } from './pages/BrowsePage.jsx';
import { ClientDetailPage, ContractDetailPage, FreelancerDetailPage } from './pages/DetailPages.jsx';
import { EscrowPage } from './pages/EscrowPage.jsx';
import { FundGigPage } from './pages/FundGigPage.jsx';
import { ReviewsPage } from './pages/ReviewsPage.jsx';
import { WorkersMapPage } from './pages/WorkersMapPage.jsx';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/explore" replace />} />
        <Route path="explore" element={<BrowsePage />} />
        <Route path="directory" element={<ExploreRedirect />} />
        <Route path="browse" element={<ExploreRedirect />} />
        <Route path="clients/:id" element={<ClientDetailPage />} />
        <Route path="freelancers/:id" element={<FreelancerDetailPage />} />
        <Route path="contracts/:id" element={<ContractDetailPage />} />
        <Route path="fund" element={<FundGigPage />} />
        <Route path="escrow" element={<EscrowPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="workers" element={<WorkersMapPage />} />
        <Route path="reviews" element={<ReviewsPage />} />
        <Route
          path="*"
          element={
            <EmptyState title="Page not found">
              <Link to="/explore">Go to Explore</Link>
            </EmptyState>
          }
        />
      </Route>
    </Routes>
  );
}

function ExploreRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/explore${search}`} replace />;
}
