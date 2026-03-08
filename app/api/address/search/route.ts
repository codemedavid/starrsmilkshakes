import { NextRequest, NextResponse } from 'next/server';
import { checkServerRateLimit } from '@/lib/server-rate-limit';
import { getClientIP } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * Proxy endpoint for Nominatim address search
 * This avoids CORS issues and respects Nominatim's usage policy
 * by making requests from the server side
 */
export async function GET(request: NextRequest) {
  try {
    const rateLimit = checkServerRateLimit(`address-search:${getClientIP(request)}`, 30, 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: `Too many address lookups. Try again in ${rateLimit.retryAfterSeconds} seconds.` },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');

    if (!query || query.trim().length < 3) {
      return NextResponse.json(
        { error: 'Query must be at least 3 characters' },
        { status: 400 }
      );
    }

    // Build Nominatim API URL
    const params = new URLSearchParams({
      q: `${query}, Philippines`,
      countrycodes: 'ph',
      format: 'json',
      limit: '10',
      addressdetails: '1',
      extratags: '1',
      namedetails: '1',
      dedupe: '1'
    });

    const nominatimUrl = `https://nominatim.openstreetmap.org/search?${params.toString()}`;

    // Make request to Nominatim from server (no CORS issues)
    const response = await fetch(nominatimUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'StarrsFamousShakes/1.0 (https://starrsfamousshakes.com)',
        'Accept': 'application/json',
        'Referer': request.headers.get('referer') || 'https://starrsfamousshakes.com'
      }
    });

    if (!response.ok) {
      console.error('Nominatim API error:', response.status, response.statusText);
      return NextResponse.json(
        { error: `Nominatim API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Return the data as-is (it's already in the correct format)
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
      }
    });

  } catch (error) {
    console.error('Error proxying Nominatim request:', error);
    return NextResponse.json(
      { error: 'Failed to fetch address suggestions' },
      { status: 500 }
    );
  }
}
