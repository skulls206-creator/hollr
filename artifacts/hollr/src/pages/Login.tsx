import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@workspace/replit-auth-web';
import { MessageSquare, Shield, Lock, Eye, EyeOff, Loader2, User, KeyRound } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type Mode = 'login' | 'signup';

export function Login() {
  const { setAuthUser } = useAuth();
  const [, navigate] = useLocation();

  const [mode, setMode] = useState<Mode>('login');
  const [identifier, setIdentifier] = useState('');   // username or email (login)
  const [username, setUsername] = useState('');        // username only (signup)
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
        ? { username: username.trim(), password }
        : { identifier: identifier.trim(), password };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? (mode === 'signup' ? 'Signup failed' : 'Login failed'));
        return;
      }

      // Set auth state immediately so the app can render without waiting for
      // a cookie round-trip, then navigate to /app so RequireAuth mounts fresh.
      setAuthUser({ id: data.id, email: data.email ?? null, firstName: null, lastName: null, profileImageUrl: null });
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
                  <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. cooluser42"
                    autoComplete="username"
                    maxLength={32}
                    required={mode === 'signup'}
                    className="w-full bg-secondary/50 border border-border/50 rounded-xl pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground/60 mt-1 ml-1">Letters, numbers and underscores only (3–32 chars)</p>
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
                  <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="username or email@example.com"
                    autoComplete="username"
                    required={mode === 'login'}
                    className="w-full bg-secondary/50 border border-border/50 rounded-xl pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
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
              <KeyRound size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'Min. 6 characters' : '••••••••'}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                required
                className="w-full bg-secondary/50 border border-border/50 rounded-xl pl-10 pr-11 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-[13px] text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2"
            >
              {error}
            </motion.p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl h-12 bg-primary hover:bg-primary/90 text-white font-bold text-base shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-2 disabled:opacity-60 transition mt-1"
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : mode === 'login' ? (
              'Sign In'
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        {/* Footer note */}
        <div className="flex items-center justify-center gap-6 mt-8 text-xs text-muted-foreground/50 font-medium">
          <span className="flex items-center gap-1"><Shield size={12} /> Encrypted at rest</span>
          <span className="flex items-center gap-1"><Lock size={12} /> Never sold or shared</span>
        </div>
      </motion.div>
    </div>
  );
}
