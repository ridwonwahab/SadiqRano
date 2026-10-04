"use client";

import { useEffect, useState } from "react";
import { LogOut, UserRound } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function AuthButton() {
  const [email, setEmail] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    try {
      const supabase = getSupabaseBrowserClient();
      void supabase.auth.getSession().then(({ data, error }) => {
        if (error) setMessage(error.message);
        setEmail(data.session?.user.email ?? null);
      });
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        setEmail(session?.user.email ?? null);
      });
      return () => data.subscription.unsubscribe();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication is not configured.");
    }
  }, []);

  async function signIn() {
    setMessage("");
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(window.location.pathname)}`,
        },
      });
      if (error) setMessage(error.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start Google sign-in.");
    }
  }

  async function signOut() {
    try {
      const { error } = await getSupabaseBrowserClient().auth.signOut();
      if (error) setMessage(error.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sign out.");
    }
  }

  return (
    <div className="auth-wrap">
      {email ? (
        <button className="account-button" onClick={signOut} title={`Sign out ${email}`}>
          <LogOut size={16} aria-hidden="true" />
          <span>Sign out</span>
        </button>
      ) : (
        <button className="account-button" onClick={signIn}>
          <UserRound size={16} aria-hidden="true" />
          <span>Sign in</span>
        </button>
      )}
      {message && <span className="auth-message" role="status">{message}</span>}
    </div>
  );
}
