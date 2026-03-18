'use client';

import { useState, useEffect, useCallback } from 'react';
import { connectFacebook, disconnectFacebook, getFacebookStatus } from '@/actions/facebook';
import type { FBStatus } from '@/actions/facebook';

declare global {
  interface Window {
    FB: any;
    fbAsyncInit: () => void;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FacebookContent() {
  const [status, setStatus] = useState<FBStatus>({ connected: false });
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ── Fetch current FB connection status ─────────────────────────────────────

  const fetchStatus = useCallback(async () => {
    setErrorMessage(null);
    try {
      const data = await getFacebookStatus();
      setStatus(data);
    } catch (err) {
      console.error('[FacebookContent] Failed to fetch FB status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // ── Load Facebook JS SDK ────────────────────────────────────────────────────

  useEffect(() => {
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
  }, []);

  // ── Connect flow ────────────────────────────────────────────────────────────

  const connectWithToken = useCallback(
    async (accessToken: string) => {
      setErrorMessage(null);
      try {
        const result = await connectFacebook(accessToken);
        if (result.success) {
          await fetchStatus();
        } else {
          setErrorMessage(result.error || 'Connection failed');
        }
      } catch {
        setErrorMessage('Connection failed');
      } finally {
        setConnecting(false);
      }
    },
    [fetchStatus],
  );

  const handleConnect = () => {
    if (!window.FB) return;

    // FB.login requires HTTPS
    if (window.location.protocol !== 'https:') {
      setErrorMessage(
        'Facebook Login requires HTTPS. Run: npx next dev --experimental-https, or use your production URL.',
      );
      return;
    }

    setConnecting(true);
    setErrorMessage(null);

    // FB.login callback must be synchronous — extract token then handle async
    window.FB.login(
      (response: any) => {
        if (response.authResponse) {
          connectWithToken(response.authResponse.accessToken);
        } else {
          setConnecting(false);
        }
      },
      { scope: 'pages_manage_metadata,pages_messaging,pages_read_engagement' },
    );
  };

  // ── Disconnect flow ─────────────────────────────────────────────────────────

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Facebook Page? Messenger chatbot will stop working.')) return;
    setConnecting(true);
    setErrorMessage(null);
    try {
      const result = await disconnectFacebook();
      if (result.success) {
        await fetchStatus();
      } else {
        setErrorMessage(result.error || 'Disconnect failed');
      }
    } catch {
      setErrorMessage('Disconnect failed');
    } finally {
      setConnecting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF8]">
        <div className="border-b border-[#E8E3DA] bg-white px-6 py-5">
          <div className="space-y-2">
            <div className="h-7 w-48 bg-[#E8E3DA] rounded-lg animate-pulse" />
            <div className="h-4 w-64 bg-[#E8E3DA]/60 rounded animate-pulse" />
          </div>
        </div>
        <div className="p-6">
          <div className="bg-white rounded-xl border border-[#E8E3DA] p-6 animate-pulse space-y-4">
            <div className="h-5 w-56 bg-[#E8E3DA] rounded" />
            <div className="h-4 w-40 bg-[#E8E3DA]/60 rounded" />
            <div className="h-10 w-48 bg-[#E8E3DA] rounded-[10px]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Page header */}
      <div className="border-b border-[#E8E3DA] bg-white px-6 py-5">
        <h1 className="font-playfair text-2xl font-semibold text-stone-900">
          Facebook Integration
        </h1>
        <p className="font-nunito text-sm text-stone-500 mt-1">
          Connect your Facebook Page to enable Messenger chatbot orders.
        </p>
      </div>

      <div className="p-6">
        <div className="bg-[#F2EEE8] rounded-xl border border-[#E8E3DA] p-6 max-w-lg">
          <h2 className="font-playfair text-lg font-semibold text-stone-900 mb-4">
            Facebook Messenger Integration
          </h2>

          {/* Error banner */}
          {errorMessage && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 font-nunito">
              {errorMessage}
            </div>
          )}

          {status.connected ? (
            <div className="space-y-4">
              {/* Connected status row */}
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 bg-green-500 rounded-full flex-shrink-0"
                  aria-hidden="true"
                />
                <span className="font-nunito font-medium text-stone-800">
                  Connected to: {status.pageName}
                </span>
              </div>

              {status.pageId && (
                <p className="font-nunito text-xs text-stone-400">Page ID: {status.pageId}</p>
              )}

              {status.connectedAt && (
                <p className="font-nunito text-xs text-stone-400">
                  Connected{' '}
                  {new Date(status.connectedAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </p>
              )}

              {/* Token expiry warning */}
              {status.tokenExpiring && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm font-nunito text-yellow-800">
                  Page token expiring soon. Please reconnect to refresh.
                </div>
              )}

              <button
                type="button"
                onClick={handleDisconnect}
                disabled={connecting}
                className="
                  inline-flex items-center gap-2 px-4 py-2
                  bg-red-100 text-red-700 font-nunito font-semibold text-sm
                  rounded-[10px] border border-red-200
                  hover:bg-red-200 active:bg-red-300
                  disabled:opacity-50 disabled:cursor-not-allowed
                  focus:outline-none focus:ring-2 focus:ring-red-400/40 focus:ring-offset-2
                  transition-all duration-200
                "
              >
                {connecting ? 'Disconnecting…' : 'Disconnect Page'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Disconnected status row */}
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 bg-stone-400 rounded-full flex-shrink-0"
                  aria-hidden="true"
                />
                <span className="font-nunito text-stone-500">Not connected</span>
              </div>

              <p className="font-nunito text-sm text-stone-500">
                Click the button below to log in with Facebook and authorise access to your Page.
              </p>

              <button
                type="button"
                onClick={handleConnect}
                disabled={connecting || !sdkLoaded}
                className="
                  inline-flex items-center gap-2 px-5 py-2.5
                  bg-[#7BBFB5] text-[#F0EBE0] font-nunito font-semibold text-sm
                  rounded-[10px] shadow-sm
                  hover:bg-[#3D8A80] active:bg-[#2C6E65]
                  disabled:opacity-50 disabled:cursor-not-allowed
                  focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:ring-offset-2
                  transition-all duration-200
                "
              >
                {connecting ? 'Connecting…' : !sdkLoaded ? 'Loading SDK…' : 'Connect Facebook Page'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
