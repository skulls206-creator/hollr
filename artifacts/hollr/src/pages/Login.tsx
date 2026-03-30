import { useState, useEffect, useMemo } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useAuth } from '@workspace/replit-auth-web';
import { MessageSquare, Lock, Eye, EyeOff, Loader2, User, KeyRound } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type Mode = 'login' | 'signup';

export function Login() {
  const { setAuthUser } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();

  const refCode = useMemo(() => new URLSearchParams(search).get('ref'), [search]);

  const [mode, setMode] = useState<Mode>(refCode ? 'signup' : 'login');

  // Sync mode to signup when a ref code appears (SPA navigation)
  useEffect(() => {
    if (refCode) setMode('signup');
  }, [refCode]);

  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [referrerName, setReferrerName] = useState<string | null>(null);

  // Fetch referrer's display name when a ref code is in the URL
  useEffect(() => {
    if (!refCode) return;
    fetch(`/api/referral/info/${encodeURIComponent(refCode)}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: { displayName?: string } | null) => {
        if (data?.displayName) setReferrerName(data.displayName);
      })
      .catch(() => {});
  }, [refCode]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError('');
    setIdentifier('');
    setUsername('');
    setPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const url = mode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
      const body = mode === 'signup'
        ? { username: username.trim(), password, ref: refCode ?? undefined }
        : { identifier: identifier.trim(), password };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json() as { id?: string; email?: string | null; username?: string; referrerName?: string | null; error?: string };

      if (!res.ok) {
        setError(data.error ?? (mode === 'signup' ? 'Signup failed' : 'Login failed'));
        return;
      }

      // After a referred signup, store the referrer's name so the welcome
      // toast can be shown once after the user lands in the app.
      if (mode === 'signup' && data.referrerName) {
        sessionStorage.setItem('hollr_welcome_referrer', data.referrerName);
      }

      setAuthUser({ id: data.id!, email: data.email ?? null, firstName: null, lastName: null, profileImageUrl: null });
      navigate('/app');
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative bg-[#09090b] overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 opacity-40 mix-blend-screen">
        <img
          src={`${import.meta.env.BASE_URL}images/auth-bg.png`}
          alt=""
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#09090b] via-transparent to-transparent" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md bg-card/60 backdrop-blur-xl p-10 rounded-3xl border border-border/50 shadow-2xl shadow-primary/10 relative z-10"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/30 mb-5 -rotate-6">
            <MessageSquare size={32} className="text-white rotate-6" />
          </div>
          <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">
            {mode === 'login' ? 'Hollr Back' : 'Join Hollr'}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {mode === 'login'
              ? 'Sign in to your account to continue.'
              : 'Create a free account in seconds.'}
          </p>
        </div>

        {/* Referral invite banner — shown in signup mode when a ref code is present */}
        {refCode && mode === 'signup' && (
          <div className="mb-5 flex items-center gap-2.5 px-4 py-3 bg-primary/10 border border-primary/25 rounded-xl text-sm text-primary font-medium">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            {referrerName
              ? <span>You were invited by <strong>{referrerName}</strong> to join hollr!</span>
              : <span>You were invited to join hollr!</span>
            }
          </div>
        )}

        {/* Tab switcher */}
        <div className="flex bg-secondary/50 rounded-xl p-1 mb-7">
          {(['login', 'signup'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={[
                'flex-1 py-2 rounded-lg text-sm font-semibold transition-all',
                mode === m
                  ? 'bg-primary text-white shadow'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {m === 'login' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <AnimatePresence mode="wait">
            {mode === 'signup' ? (
              <motion.div
                key="username-field"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Username
                </label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="Pick a username"
                    className="w-full bg-secondary/60 border border-border/50 rounded-xl pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition"
                    autoComplete="username"
                    required
                  />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="identifier-field"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Username or Email
                </label>
                <div className="relative">
                  <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={identifier}
                    onChange={e => setIdentifier(e.target.value)}
                    placeholder="Enter your username or email"
                    className="w-full bg-secondary/60 border border-border/50 rounded-xl pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition"
                    autoComplete="username"
                    required
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'Choose a password (6+ chars)' : 'Enter your password'}
                className="w-full bg-secondary/60 border border-border/50 rounded-xl pl-9 pr-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                required
                minLength={mode === 'signup' ? 6 : undefined}
              />
              <button
                type="button"
                onClick={() => setShowPw(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
                tabIndex={-1}
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Error message */}
          <AnimatePresence>
            {error && (
              <motion.p
                key="error"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="text-red-400 text-sm text-center"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white font-semibold py-3 rounded-xl hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-1"
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : null}
            {mode === 'signup' ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground mt-6">
          {mode === 'login'
            ? "Don't have an account? "
            : 'Already have an account? '}
          <button
            type="button"
            onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
            className="text-primary hover:underline font-semibold"
          >
            {mode === 'login' ? 'Sign Up' : 'Sign In'}
          </button>
        </p>

        <div className="mt-6 pt-5 border-t border-border/30 flex items-center justify-center gap-4 text-xs text-muted-foreground/60">
          <span className="flex items-center gap-1">
            <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            End-to-end encrypted
          </span>
          <span className="flex items-center gap-1">
            <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Private by default
          </span>
        </div>
      </motion.div>
    </div>
  );
}
