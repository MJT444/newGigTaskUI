import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useActor } from '../context/ActorContext.jsx';
import { ClientSearch } from './pickers.jsx';

const NAV = [
  { to: '/explore', label: 'Explore' },
  { to: '/fund', label: 'Fund gig' },
  { to: '/escrow', label: 'Escrow' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/workers', label: 'Workers map' },
  { to: '/reviews', label: 'Reviews' },
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

    </div>
  );
}
