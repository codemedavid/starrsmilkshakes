import { PostHog } from 'posthog-node';

let _posthogClient: PostHog | null = null;

/**
 * Get the server-side PostHog client
 * Uses lazy initialization to prevent build failures when env vars aren't available
 */
function getPostHogClient(): PostHog {
  if (_posthogClient) {
    return _posthogClient;
  }

  const apiKey = process.env.POSTHOG_API_KEY;
  const host = process.env.POSTHOG_HOST;

  if (!apiKey) {
    throw new Error('Missing POSTHOG_API_KEY');
  }

  _posthogClient = new PostHog(apiKey, {
    host: host || 'https://us.i.posthog.com',
    flushAt: 1,
    flushInterval: 0,
  });

  return _posthogClient;
}

export const posthog = {
  /**
   * Capture a PostHog event. Non-blocking — fires and forgets.
   * Calls shutdown() after capture to ensure the event is flushed
   * before the serverless function terminates.
   */
  async capture(distinctId: string, event: string, properties?: Record<string, any>) {
    try {
      const client = getPostHogClient();
      client.capture({ distinctId, event, properties });
      await client.shutdown();
      _posthogClient = null; // Reset so next call creates a fresh client
    } catch (error) {
      console.error('PostHog capture error:', error);
      // Non-blocking: don't throw, just log
    }
  }
};
