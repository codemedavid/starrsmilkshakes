'use client';
import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/admin-api';

interface FacebookConnectProps {
  isSuperAdmin: boolean;
}

interface FBStatus {
  connected: boolean;
  pageName?: string;
  pageId?: string;
  connectedAt?: string;
  tokenExpiring?: boolean;
}

declare global {
  interface Window {
    FB: any;
    fbAsyncInit: () => void;
  }
}

export default function FacebookConnect({ isSuperAdmin }: FacebookConnectProps) {
  const [status, setStatus] = useState<FBStatus>({ connected: false });
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [sdkLoaded, setSdkLoaded] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/facebook/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch FB status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!isSuperAdmin) return;

    window.fbAsyncInit = () => {
      window.FB.init({
        appId: process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || '',
        cookie: true,
        xfbml: false,
        version: 'v21.0',
      });
      setSdkLoaded(true);
    };

    if (!document.getElementById('facebook-jssdk')) {
      const script = document.createElement('script');
      script.id = 'facebook-jssdk';
      script.src = 'https://connect.facebook.net/en_US/sdk.js';
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    } else if (window.FB) {
      setSdkLoaded(true);
    }
  }, [isSuperAdmin]);

  const connectWithToken = useCallback(async (accessToken: string) => {
    try {
      const res = await adminFetch('/api/admin/facebook/connect', {
        method: 'POST',
        body: JSON.stringify({ accessToken }),
      });
      if (res.ok) {
        await fetchStatus();
      } else {
        const err = await res.json();
        alert(err.error || 'Connection failed');
      }
    } catch {
      alert('Connection failed');
    } finally {
      setConnecting(false);
    }
  }, [fetchStatus]);

  const handleConnect = () => {
    if (!window.FB) return;

    // FB.login requires HTTPS — check and warn
    if (window.location.protocol !== 'https:') {
      alert(
        'Facebook Login requires HTTPS. To test locally, run:\n\n' +
        '  npx next dev --experimental-https\n\n' +
        'Or deploy to your production URL.'
      );
      return;
    }

    setConnecting(true);

    // FB.login callback must be synchronous — extract token and handle async separately
    window.FB.login(
      (response: any) => {
        if (response.authResponse) {
          connectWithToken(response.authResponse.accessToken);
        } else {
          setConnecting(false);
        }
      },
      { scope: 'pages_manage_metadata,pages_messaging,pages_read_engagement' }
    );
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Facebook Page? Messenger chatbot will stop working.')) return;
    setConnecting(true);
    try {
      await adminFetch('/api/admin/facebook/disconnect', { method: 'POST' });
      await fetchStatus();
    } catch {
      alert('Disconnect failed');
    } finally {
      setConnecting(false);
    }
  };

  if (loading) return <div className="text-gray-500 p-4">Loading Facebook status...</div>;

  return (
    <div className="bg-white rounded-xl shadow p-6 mt-6">
      <h3 className="text-lg font-semibold mb-4">Facebook Messenger Integration</h3>

      {status.connected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-green-500 rounded-full" />
            <span className="font-medium">Connected to: {status.pageName}</span>
          </div>
          {status.tokenExpiring && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
              Page token expiring soon. Please reconnect to refresh.
            </div>
          )}
          {isSuperAdmin && (
            <button
              onClick={handleDisconnect}
              disabled={connecting}
              className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50"
            >
              {connecting ? 'Disconnecting...' : 'Disconnect Page'}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-gray-400 rounded-full" />
            <span className="text-gray-600">Not connected</span>
          </div>
          {isSuperAdmin ? (
            <button
              onClick={handleConnect}
              disabled={connecting || !sdkLoaded}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {connecting ? 'Connecting...' : 'Connect Facebook Page'}
            </button>
          ) : (
            <p className="text-sm text-gray-500">Only super admins can connect a Facebook Page.</p>
          )}
        </div>
      )}
    </div>
  );
}
