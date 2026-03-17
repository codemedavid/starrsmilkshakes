'use client';
import { useState } from 'react';
import { adminFetch } from '@/lib/admin-api';

interface SuperAdminLoginProps {
  onLogin: () => void;
  onBack: () => void;
}

export default function SuperAdminLogin({ onLogin, onBack }: SuperAdminLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await adminFetch('/api/admin/auth/super-login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }

      // Verify the session cookie was actually set by checking the session endpoint
      const sessionRes = await adminFetch('/api/admin/auth/super-session');
      if (!sessionRes.ok) {
        setError('Login succeeded but session could not be verified. Please try again.');
        return;
      }

      onLogin();
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">
        <h2 className="text-2xl font-bold text-center mb-6">Super Admin Login</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              required
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In as Super Admin'}
          </button>
          <button
            type="button"
            onClick={onBack}
            className="w-full py-2 text-gray-600 hover:text-gray-800 text-sm"
          >
            Back to Admin Login
          </button>
        </form>
      </div>
    </div>
  );
}
