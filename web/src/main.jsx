import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import 'leaflet/dist/leaflet.css';
import './styles/global.css';
import { App } from './App.jsx';
import { ActorProvider } from './context/ActorContext.jsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      // Don't hammer a server that is down; validation errors won't fix themselves.
      retry: (count, error) => count < 1 && (error?.status === 0 || error?.status >= 500),
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ActorProvider>
          <App />
        </ActorProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
