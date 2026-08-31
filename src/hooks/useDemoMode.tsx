import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { tenant } from '@/config/tenant';

const STORAGE_KEY = `${tenant.storagePrefix}_demo_mode`;

interface DemoModeContextValue {
  demoMode: boolean;
  setDemoMode: (v: boolean) => void;
}

const DemoModeContext = createContext<DemoModeContextValue>({
  demoMode: false,
  setDemoMode: () => {},
});

export const DemoModeProvider = ({ children }: { children: ReactNode }) => {
  const [demoMode, setDemoModeState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  });

  const setDemoMode = useCallback((v: boolean) => {
    setDemoModeState(v);
    try {
      window.localStorage.setItem(STORAGE_KEY, v ? '1' : '0');
    } catch {}
  }, []);

  // Sync across tabs
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setDemoModeState(e.newValue === '1');
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  return (
    <DemoModeContext.Provider value={{ demoMode, setDemoMode }}>
      {children}
    </DemoModeContext.Provider>
  );
};

export const useDemoMode = () => useContext(DemoModeContext);