/**
 * Cloudflare Worker - API Proxy for WordWise
 *
 * This worker acts as a CORS proxy between the browser and Anthropic API.
 * It does NOT store any API keys - users provide their own keys which are
 * passed through this proxy to avoid CORS restrictions.
 *
 * Also provides cloud sync endpoints for cross-device synchronization.
 * Stores AI prompts in KV to keep them out of the React bundle.
 *
 * Deploy to: Cloudflare Workers
 * URL will be: https://wordwise-proxy.YOUR_USERNAME.workers.dev
 */

// ==============================================================================
// PROMPT MANAGEMENT
// ==============================================================================

/**
 * Fallback prompts in case KV is unavailable
 * These are minimal versions to keep the app functional
 */
const FALLBACK_PROMPTS = {
  word_selection: {
    template: "Select next 5-letter English word for user:\nStats: {{totalGames}} games, {{winRate}}% win, {{avgGuesses}} avg\nRecent30: {{recentCompact}}\nReturn only the word, nothing else.",
    parameters: ["totalGames", "winRate", "avgGuesses", "recentCompact"]
  },
  word_reasoning: {
    template: "You selected \"{{word}}\" for a user who recently played: {{recentGames}}. In ONE sentence, explain why this word is appropriate for their skill level.",
    parameters: ["word", "recentGames"]
  },
  extended_word_info: {
    template: "For \"{{word}}\": Provide etymology, word family, and translations in JSON format.",
    parameters: ["word"]
  }
};

/**
 * Get prompt template from KV, with fallback
 */
async function getPromptTemplate(action, env) {
  try {
    const key = `prompt:${action}`;
    const promptData = await env.WORDWISE_SYNC.get(key);

    if (promptData) {
      return JSON.parse(promptData);
    }
  } catch (error) {
    console.error(`Failed to fetch prompt for ${action}:`, error);
  }

  // Fallback to hardcoded prompt
  console.warn(`Using fallback prompt for ${action}`);
  return FALLBACK_PROMPTS[action] || null;
}

/**
 * Get static data from KV
 */
async function getStaticData(dataKey, env) {
  try {
    const key = `data:${dataKey}`;
    return await env.WORDWISE_SYNC.get(key);
  } catch (error) {
    console.error(`Failed to fetch data ${dataKey}:`, error);
    return null;
  }
}

/**
 * Substitute template variables with actual parameter values
 * Supports:
 * - Simple strings: {{word}} → "APPLE"
 * - Arrays (join): {{previousHints}} → "fruit, red, crunchy"
 * - Static data refs: {{tier2_section}} → fetched from KV
 */
async function substituteParams(template, params, env) {
  let result = template;

  // Find all {{variable}} patterns
  const variablePattern = /\{\{(\w+)\}\}/g;
  const matches = [...template.matchAll(variablePattern)];

  for (const match of matches) {
    const placeholder = match[0]; // e.g., "{{word}}"
    const varName = match[1];     // e.g., "word"

    let value;

    // Check if it's in params
    if (params.hasOwnProperty(varName)) {
      value = params[varName];

      // Handle arrays by joining
      if (Array.isArray(value)) {
        value = value.join(', ');
      }
    } else {
      // Try fetching from KV as static data
      value = await getStaticData(varName, env);

      if (value === null) {
        console.warn(`Missing parameter or data: ${varName}`);
        value = ''; // Leave empty rather than showing placeholder
      }
    }

    result = result.replace(placeholder, value);
  }

  return result;
}

/**
 * Build complete prompt from action and parameters
 */
async function buildPrompt(action, params, env) {
  // Get template from KV
  const promptData = await getPromptTemplate(action, env);

  if (!promptData) {
    throw new Error(`No prompt template found for action: ${action}`);
  }

  // Substitute parameters
  const prompt = await substituteParams(promptData.template, params, env);

  return prompt;
}

/**
 * Get model configuration from KV
 */
async function getModelConfig(env) {
  try {
    const config = await env.WORDWISE_SYNC.get('config:model');
    return config ? JSON.parse(config) : null;
  } catch (error) {
    console.error('Failed to fetch model config:', error);
    return null;
  }
}

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

      let requestBody;
      let maxTokens = 50; // default

      // Check if this is a new action-based request or legacy direct prompt request
      if (body.action && body.params) {
        // NEW FORMAT: { action: "word_selection", params: { ... } }
        // Build prompt from KV template
        const prompt = await buildPrompt(body.action, body.params, env);

        // Get model config for max tokens
        const modelConfig = await getModelConfig(env);
        if (modelConfig && modelConfig.maxTokens && modelConfig.maxTokens[body.action]) {
          maxTokens = modelConfig.maxTokens[body.action];
        }

        requestBody = {
          model: 'claude-haiku-4-5',
          max_tokens: maxTokens,
          messages: [{
            role: 'user',
            content: prompt
          }]
        };
      } else if (body.model && body.messages) {
        // LEGACY FORMAT: { model: "...", messages: [...], max_tokens: ... }
        // Pass through as-is (for backward compatibility)
        requestBody = body;
      } else {
        return new Response(JSON.stringify({
          error: { message: 'Invalid request body - provide either {action, params} or {model, messages}' }
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
        body: JSON.stringify(requestBody)
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
