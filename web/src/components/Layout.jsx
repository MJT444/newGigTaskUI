import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useActor } from '../context/ActorContext.jsx';
import { ClientSearch } from './pickers.jsx';

const NAV = [
  { to: '/explore', label: 'Explore', db: 'pg' },
  { to: '/fund', label: 'Fund gig', db: 'pg' },
  { to: '/escrow', label: 'Escrow', db: 'pg' },
  { to: '/analytics', label: 'Analytics', db: 'pg' },
  { to: '/workers', label: 'Workers map', db: 'mongo' },
  { to: '/reviews', label: 'Reviews', db: 'mongo' },
];

export function Layout() {
  const { actor, setActor } = useActor();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink to="/explore" className="brand" onClick={() => setMenuOpen(false)}>
            <span className="brand-mark" aria-hidden="true">
              G
            </span>
            GigTask
          </NavLink>

          <button
            type="button"
            className="menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="main-nav"
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? 'Close' : 'Menu'}
          </button>

          <nav id="main-nav" className={`nav ${menuOpen ? 'nav-open' : ''}`} aria-label="Main">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                {n.label}
                <span className={`db-tag db-${n.db}`}>{n.db === 'pg' ? 'PG' : 'Mongo'}</span>
              </NavLink>
            ))}
          </nav>

          <div className="topbar-right">
            <div className="acting-as">
              <span className="acting-label">Acting as client</span>
              <ClientSearch value={actor} onSelect={setActor} compact />
            </div>
          </div>
        </div>
      </header>

      <main className="main" key={location.pathname}>
        <Outlet />
      </main>

      <footer className="footer">GigTask</footer>
    </div>
  );
}
/* ==========================================
   GigTask UI Refresh
   Modern dashboard styling
   ========================================== */