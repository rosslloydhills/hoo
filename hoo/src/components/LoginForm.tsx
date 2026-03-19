'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase/browserClient';

export function LoginForm() {
  const router = useRouter();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const supabase = getSupabaseClient();
      if (mode === 'login') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (signInError) {
          setError(signInError.message);
          setSubmitting(false);
          return;
        }

        setSubmitting(false);
        router.replace('/');
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password
        });

        if (signUpError) {
          setError(signUpError.message);
          setSubmitting(false);
          return;
        }

        // Keep UX simple: after sign-up, switch back to login.
        setMode('login');
        setPassword('');
        setSubmitting(false);
      }
    } catch (err) {
      const fallback = mode === 'login' ? 'Login failed.' : 'Sign up failed.';
      setError(err instanceof Error ? err.message : fallback);
      setSubmitting(false);
    }
  }

  return (
    <div className="hoo-card hoo-loginPanel">
      <div className="hoo-loginTitle">Hey.</div>

      <form onSubmit={onSubmit} aria-label={mode === 'login' ? 'Login' : 'Sign up'}>
        <div className="hoo-field">
          <div className="hoo-label">Email</div>
          <input
            className="hoo-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@harvard.edu"
            required
          />
        </div>

        <div className="hoo-field">
          <div className="hoo-label">Password</div>
          <input
            className="hoo-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            required
          />
        </div>

        {error ? <div className="hoo-error">{error}</div> : null}

        <div style={{ height: 14 }} />

        <button className="hoo-btn" type="submit" disabled={submitting}>
          {submitting ? (mode === 'login' ? 'Logging in…' : 'Signing up…') : mode === 'login' ? 'Log In' : 'Sign up'}
        </button>

        <div style={{ marginTop: 14, textAlign: 'center' }}>
          {mode === 'login' ? (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setMode('signup');
              }}
              style={{
                appearance: 'none',
                background: 'transparent',
                border: 'none',
                padding: 0,
                color: 'rgba(165, 28, 48, 0.95)',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              Don&apos;t have an account? Sign up
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setMode('login');
              }}
              style={{
                appearance: 'none',
                background: 'transparent',
                border: 'none',
                padding: 0,
                color: 'rgba(165, 28, 48, 0.95)',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              Already have an account? Log in
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

