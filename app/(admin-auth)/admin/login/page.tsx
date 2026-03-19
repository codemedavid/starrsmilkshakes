'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

type LoginMode = 'admin' | 'super_admin';

export default function AdminLoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>('admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'admin') {
        // Regular admin login — password only
        const res = await fetch('/api/admin/auth/login', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || 'Login failed');
          return;
        }

        router.push('/admin/orders');
      } else {
        // Super admin login — email + password
        const res = await fetch('/api/admin/auth/super-login', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || 'Login failed');
          return;
        }

        // Verify the session cookie was set
        const sessionRes = await fetch('/api/admin/auth/super-session', {
          credentials: 'include',
        });
        if (!sessionRes.ok) {
          setError('Login succeeded but session could not be verified. Please try again.');
          return;
        }

        router.push('/admin/orders');
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode: LoginMode) => {
    setMode(newMode);
    setError('');
    setPassword('');
    if (newMode === 'admin') {
      setEmail('');
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo / Branding */}
        <div className="text-center mb-8">
          <h1 className="font-playfair text-3xl font-semibold text-[#3D8A80] leading-tight">
            starr&apos;s famous shakes
          </h1>
          <p className="font-nunito text-sm text-stone-500 mt-2">
            Admin Dashboard
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-xl border border-[#E8E3DA] shadow-sm p-8">
          {/* Mode Tabs */}
          <div className="flex rounded-[10px] bg-[#F2EEE8] p-1 mb-6">
            <button
              type="button"
              onClick={() => switchMode('admin')}
              className={`
                flex-1 py-2 text-sm font-nunito font-medium rounded-lg
                transition-all duration-200
                ${mode === 'admin'
                  ? 'bg-white text-[#3D8A80] shadow-sm'
                  : 'text-stone-500 hover:text-stone-700'
                }
              `}
            >
              Admin
            </button>
            <button
              type="button"
              onClick={() => switchMode('super_admin')}
              className={`
                flex-1 py-2 text-sm font-nunito font-medium rounded-lg
                transition-all duration-200
                ${mode === 'super_admin'
                  ? 'bg-white text-[#3D8A80] shadow-sm'
                  : 'text-stone-500 hover:text-stone-700'
                }
              `}
            >
              Super Admin
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email field (super admin only) */}
            {mode === 'super_admin' && (
              <div>
                <label className="block text-sm font-nunito font-medium text-stone-700 mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="admin@example.com"
                  required
                  className="
                    w-full px-3.5 py-2.5
                    bg-[#F2EEE8] border border-[#E8E3DA] rounded-[10px]
                    text-sm font-nunito text-stone-900 placeholder:text-stone-400
                    focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5] focus:bg-white
                    transition-all duration-200
                  "
                />
              </div>
            )}

            {/* Password field */}
            <div>
              <label className="block text-sm font-nunito font-medium text-stone-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder={mode === 'admin' ? 'Enter admin password' : 'Enter your password'}
                  required
                  className="
                    w-full px-3.5 py-2.5 pr-12
                    bg-[#F2EEE8] border border-[#E8E3DA] rounded-[10px]
                    text-sm font-nunito text-stone-900 placeholder:text-stone-400
                    focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5] focus:bg-white
                    transition-all duration-200
                  "
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-colors duration-200"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm font-nunito text-red-700">{error}</p>
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="
                w-full py-3 mt-2
                bg-[#7BBFB5] text-[#F0EBE0] font-nunito font-semibold text-sm
                rounded-[10px] shadow-sm
                hover:bg-[#3D8A80] active:bg-[#2C6E65]
                focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:ring-offset-2
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-all duration-200
              "
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in...
                </span>
              ) : (
                'Sign in'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
