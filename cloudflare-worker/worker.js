/**
 * Cloudflare Worker - API Proxy for WordWise
 *
 * This worker acts as a CORS proxy between the browser and Anthropic API.
 * It does NOT store any API keys - users provide their own keys which are
 * passed through this proxy to avoid CORS restrictions.
 *
 * Also provides cloud sync endpoints for cross-device synchronization.
 *
 * Deploy to: Cloudflare Workers
 * URL will be: https://wordwise-proxy.YOUR_USERNAME.workers.dev
 */

/**
 * Generate a random 8-character sync code in format: XXXX-YYYY
 */
function generateSyncCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous chars (0, O, 1, I)
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * CORS headers for all responses
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Max-Age': '86400'
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Route sync endpoints
    if (path.startsWith('/sync/')) {
      return handleSyncRequest(request, env, path);
    }

    // Original API proxy logic (only allow POST for API proxy)
    if (request.method !== 'POST') {
      return new Response('Method not allowed', {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    const origin = request.headers.get('Origin');
    const allowedOrigins = [
      'https://zsmaguc.github.io',
      'http://localhost:5173'
    ];

    if (origin && !allowedOrigins.includes(origin)) {
      return new Response('Forbidden - Invalid origin', {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Get the API key from request header
    const apiKey = request.headers.get('X-API-Key');
    if (!apiKey) {
      return new Response(JSON.stringify({
        error: { message: 'Missing API key in X-API-Key header' }
      }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    try {
      // Parse request body
      const body = await request.json();

      // Validate required fields
      if (!body.model || !body.messages) {
        return new Response(JSON.stringify({
          error: { message: 'Invalid request body - missing model or messages' }
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // Forward request to Anthropic API
      const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body)
      });

      // Get response from Anthropic
      const data = await anthropicResponse.json();

      // Return response with CORS headers
      return new Response(JSON.stringify(data), {
        status: anthropicResponse.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        }
      });

    } catch (error) {
      console.error('Worker error:', error);

      return new Response(JSON.stringify({
        error: {
          message: error.message || 'Internal server error',
          type: 'worker_error'
        }
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  }
};

/**
 * Handle cloud sync requests
 */
async function handleSyncRequest(request, env, path) {
  try {
    // POST /sync/generate - Generate new sync code
    if (path === '/sync/generate' && request.method === 'POST') {
      const body = await request.json();

      // Validate that data is provided
      if (!body.data) {
        return new Response(JSON.stringify({
          error: 'Missing data field'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // Generate unique sync code
      let code;
      let attempts = 0;
      do {
        code = generateSyncCode();
        const exists = await env.WORDWISE_SYNC.get(code);
        if (!exists) break;
        attempts++;
      } while (attempts < 10);

      if (attempts >= 10) {
        return new Response(JSON.stringify({
          error: 'Failed to generate unique sync code'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // Store data with metadata
      const syncData = {
        data: body.data,
        version: 1,
        lastSync: Date.now(),
        createdAt: Date.now()
      };

      await env.WORDWISE_SYNC.put(code, JSON.stringify(syncData));

      return new Response(JSON.stringify({ code }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // GET /sync/:code - Fetch data by sync code
    if (request.method === 'GET') {
      const code = path.replace('/sync/', '');

      if (!code || code.length !== 9) { // XXXX-YYYY = 9 chars
        return new Response(JSON.stringify({
          error: 'Invalid sync code format'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      const syncDataRaw = await env.WORDWISE_SYNC.get(code);

      if (!syncDataRaw) {
        return new Response(JSON.stringify({
          error: 'Sync code not found'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      const syncData = JSON.parse(syncDataRaw);

      return new Response(JSON.stringify(syncData), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // PUT /sync/:code - Update data with version check
    if (request.method === 'PUT') {
      const code = path.replace('/sync/', '');
      const body = await request.json();

      if (!code || code.length !== 9) {
        return new Response(JSON.stringify({
          error: 'Invalid sync code format'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      if (!body.data || body.version === undefined) {
        return new Response(JSON.stringify({
          error: 'Missing data or version field'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      const syncDataRaw = await env.WORDWISE_SYNC.get(code);

      if (!syncDataRaw) {
        return new Response(JSON.stringify({
          error: 'Sync code not found'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      const currentData = JSON.parse(syncDataRaw);

      // Version conflict check
      if (body.version <= currentData.version) {
        return new Response(JSON.stringify({
          error: 'Version conflict',
          currentVersion: currentData.version,
          currentData: currentData
        }), {
          status: 409,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // Update data
      const updatedData = {
        data: body.data,
        version: body.version,
        lastSync: Date.now(),
        createdAt: currentData.createdAt
      };

      await env.WORDWISE_SYNC.put(code, JSON.stringify(updatedData));

      return new Response(JSON.stringify({ success: true, version: body.version }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    return new Response(JSON.stringify({
      error: 'Invalid sync endpoint or method'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });

  } catch (error) {
    console.error('Sync error:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Internal sync error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}
