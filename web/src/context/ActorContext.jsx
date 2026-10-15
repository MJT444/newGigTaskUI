// "Who am I?" for the demo. The actor is a CLIENT (clients fund gigs and own
// the escrow balance). There is no real login - the brief says one is not
// required - so the header switcher just picks a seeded client.
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const STORAGE_KEY = 'gigtask.actor';
const ActorContext = createContext(null);

function readStored() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function ActorProvider({ children }) {
  const [actor, setActorState] = useState(readStored);

  const setActor = useCallback((next) => {
    setActorState(next);
    try {
      if (next) window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: next.id, name: next.name }));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // storage blocked: the choice still works in this tab
    }
  }, []);

  const value = useMemo(() => ({ actor, setActor }), [actor, setActor]);
  return <ActorContext.Provider value={value}>{children}</ActorContext.Provider>;
}

export function useActor() {
  const ctx = useContext(ActorContext);
  if (!ctx) throw new Error('useActor must be used inside <ActorProvider>');
  return ctx;
}
