import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { clearSession, getSession, roleFromId, saveSession, type RoleName, type Session } from "../lib/pharmacyApi";

interface AuthContextValue {
  session: Session | null;
  role: RoleName | null;
  signIn(session: Session): void;
  signOut(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => getSession());
  useEffect(() => {
    const handleExpired = () => setSession(null);
    window.addEventListener("medistock:session-ended", handleExpired);
    return () => window.removeEventListener("medistock:session-ended", handleExpired);
  }, []);
  const signIn = useCallback((next: Session) => { saveSession(next); setSession(next); }, []);
  const signOut = useCallback(() => { clearSession(); setSession(null); }, []);
  const value = useMemo(() => ({ session, role: session ? roleFromId(session.roleId) : null, signIn, signOut }), [session, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
