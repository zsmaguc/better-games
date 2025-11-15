/**
 * Cloudflare Worker - API Proxy for WordWise
 *
 * This worker acts as a CORS proxy between the browser and Anthropic API.
 * It does NOT store any API keys - users provide their own keys which are
 * passed through this proxy to avoid CORS restrictions.
 *
 * Deploy to: Cloudflare Workers
 * URL will be: https://wordwise-proxy.YOUR_USERNAME.workers.dev
 */

export default {
  async fetch(request) {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    // Only allow POST requests
    if (request.method !== 'POST') {
      return new Response('Method not allowed', {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
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
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
};
