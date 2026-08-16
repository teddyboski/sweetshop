import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../supabase/client";
import { deregisterPushNotifications } from "../push/register";

type AuthContextValue = {
  session: Session | null;
  /** True only during the initial session lookup on app launch. */
  isLoading: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Restores a persisted session from SecureStore if one exists - this
    // is what makes "a signed-in session survives an app restart"
    // (Milestone 11 completion criterion) actually observable on launch,
    // not just true in theory because persistSession is set.
    supabase.auth.getSession().then(({ data: { session: restoredSession } }) => {
      setSession(restoredSession);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signInWithPassword(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  // Milestone 23: same Supabase Auth project as the web app's signup page
  // (src/app/(auth)/signup/page.tsx) - same signUp() call, same
  // confirm-your-email requirement. No mobile deep-link back into the app
  // after confirming; the user just returns and logs in, matching web's
  // "check your email" flow rather than adding new deep-link plumbing.
  async function signUp(email: string, password: string) {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    // Deregisters this device's push token first (Milestone 14, Product
    // Decision #5) - needs the still-valid bearer token, so it must run
    // before supabase.auth.signOut() clears the session out from under it.
    await deregisterPushNotifications();
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ session, isLoading, signInWithPassword, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
