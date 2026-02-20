import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { validateAiReportInput } from '../shared/validate.js';
import { checkRateLimitCustom } from '../shared/dynamo.js';
import type { AiReportResponse } from '../shared/types.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_REPO = 'Kulitorum/Decenza';
const GITHUB_PAT = process.env.GITHUB_PAT || '';

function respond(statusCode: number, body: AiReportResponse): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

/**
 * Sanitize user-provided text to prevent markdown injection
 */
function sanitizeText(text: string): string {
  let sanitized = text
    .replace(/\/Users\/[^\/\s]+/g, '/Users/[redacted]')
    .replace(/\/home\/[^\/\s]+/g, '/home/[redacted]')
    .replace(/C:\\Users\\[^\\]+/g, 'C:\\Users\\[redacted]')
    .replace(/C:\/Users\/[^\/\s]+/g, 'C:/Users/[redacted]')
    .replace(/\\Users\\[^\\]+/g, '\\Users\\[redacted]');

  sanitized = sanitized
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, '\\[$1\\]\\($2\\)')
    .replace(/!\[([^\]]*)\]\(([^)]*)\)/g, '!\\[$1\\]\\($2\\)');

  // Escape backtick fences so user text can't break out of code blocks
  sanitized = sanitized.replace(/^(`{3,})/gm, '\\$1');

  // Escape HTML tags to prevent injection outside code fences (e.g. <img>, <details>)
  sanitized = sanitized.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return sanitized;
}

/** GitHub Gist per-file limit is 1 MB; stay safely under */
const MAX_GIST_FILE_BYTES = 900_000;

/** Truncate a string to fit within a UTF-8 byte budget, keeping the head */
function truncateBytesHead(s: string, maxBytes: number): string {
  const encoded = new TextEncoder().encode(s);
  if (encoded.length <= maxBytes) return s;
  return new TextDecoder().decode(encoded.slice(0, maxBytes)) + '\n... (truncated due to size)';
}

/** Truncate a string to fit within a UTF-8 byte budget, keeping the tail (most recent content) */
function truncateBytesTail(s: string, maxBytes: number): string {
  const encoded = new TextEncoder().encode(s);
  if (encoded.length <= maxBytes) return s;
  const truncated = new TextDecoder().decode(encoded.slice(encoded.length - maxBytes));
  return '(earlier content truncated due to size)\n...\n' + truncated;
}

/**
 * Create a secret GitHub Gist with the full AI report content
 */
async function createGist(
  systemPrompt: string,
  conversationTranscript: string,
  shotDebugLog: string | undefined,
  providerName: string,
  modelName: string
): Promise<{ id: string; url: string } | null> {
  if (!GITHUB_PAT) {
    console.error('GITHUB_PAT not configured');
    return null;
  }

  const files: Record<string, { content: string }> = {
    'system_prompt.md': {
      content: truncateBytesHead(
        `# System Prompt\n\n**Provider:** ${sanitizeText(providerName)}\n**Model:** ${sanitizeText(modelName)}\n\n---\n\n${sanitizeText(systemPrompt)}`,
        MAX_GIST_FILE_BYTES
      ),
    },
    'conversation.md': {
      content: truncateBytesTail(
        `# Conversation Transcript\n\n${sanitizeText(conversationTranscript)}`,
        MAX_GIST_FILE_BYTES
      ),
    },
  };

  if (shotDebugLog) {
    files['debug_log.txt'] = {
      content: truncateBytesHead(sanitizeText(shotDebugLog), MAX_GIST_FILE_BYTES),
    };
  }

  let response: Response;
  try {
    response = await fetch(`${GITHUB_API_BASE}/gists`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_PAT}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Decenza-DE1-AiReporter',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        description: `AI Report: ${sanitizeText(providerName)} / ${sanitizeText(modelName)}`,
        public: false,
        files,
      }),
    });
  } catch (error) {
    console.error('createGist: network error:', error);
    return null;
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error('GitHub Gist creation failed:', response.status, errorText);
    return null;
  }

  const data = await response.json() as { id?: unknown; html_url?: unknown };
  if (typeof data.id !== 'string' || typeof data.html_url !== 'string') {
    console.error('createGist: unexpected response shape:', JSON.stringify(data).slice(0, 200));
    return null;
  }
  if (!data.html_url.startsWith('https://gist.github.com/')) {
    console.error('createGist: unexpected Gist URL:', data.html_url, '— cleaning up gistId:', data.id);
    await deleteGist(data.id);
    return null;
  }
  return { id: data.id, url: data.html_url };
}

/**
 * Delete a GitHub Gist (best-effort cleanup)
 */
async function deleteGist(gistId: string): Promise<void> {
  try {
    const response = await fetch(`${GITHUB_API_BASE}/gists/${gistId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${GITHUB_PAT}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Decenza-DE1-AiReporter',
      },
    });
    if (!response.ok) {
      const body = await response.text();
      console.error('deleteGist: non-OK response — Gist may be orphaned. gistId:', gistId, 'status:', response.status, 'body:', body.slice(0, 500));
    }
  } catch (error) {
    console.error('deleteGist: network error — Gist may be orphaned. gistId:', gistId, 'error:', error);
  }
}

/**
 * Create a GitHub issue with summary and link to Gist
 */
async function createGitHubIssue(
  version: string,
  platform: string,
  device: string | undefined,
  providerName: string,
  modelName: string,
  contextLabel: string | undefined,
  userNotes: string,
  conversationPreview: string,
  isTruncated: boolean,
  gistUrl: string
): Promise<{ url: string } | null> {
  const title = `[AI Report] ${sanitizeText(providerName)} / ${sanitizeText(modelName)} - v${sanitizeText(version)}`;

  const body = `## AI Advice Report

**Version:** ${sanitizeText(version)}
**Platform:** ${sanitizeText(platform)}${device ? `\n**Device:** ${sanitizeText(device)}` : ''}
**Provider:** ${sanitizeText(providerName)}
**Model:** ${sanitizeText(modelName)}${contextLabel ? `\n**Context:** ${sanitizeText(contextLabel)}` : ''}

### User Notes
${sanitizeText(userNotes)}

### Conversation Preview
\`\`\`
${sanitizeText(conversationPreview)}${isTruncated ? '\n... (see full transcript in Gist)' : ''}
\`\`\`

### Full Report
[View full system prompt, conversation transcript, and debug log](${gistUrl})

---
*Auto-reported by Decenza DE1 app*`;

  try {
    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${GITHUB_REPO}/issues`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_PAT}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'Decenza-DE1-AiReporter',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          body,
          labels: ['ai-report', 'auto-reported'],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GitHub issue creation failed:', response.status, errorText);
      return null;
    }

    const data = await response.json() as { html_url?: unknown };
    if (typeof data.html_url !== 'string' || !data.html_url.startsWith('https://github.com/')) {
      console.error('createGitHubIssue: unexpected html_url:', data.html_url);
      return null;
    }
    return { url: data.html_url };
  } catch (error) {
    console.error('Error creating GitHub issue:', error);
    return null;
  }
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  // Handle CORS preflight
  if (event.requestContext.http.method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
    };
  }

  try {
    return await handleRequest(event);
  } catch (error) {
    console.error('aiReport handler: unhandled exception', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return respond(500, { success: false, error: 'Internal server error' });
  }
}

async function handleRequest(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  // Get client IP for rate limiting
  const clientIp = event.requestContext?.http?.sourceIp ?? 'unknown';

  // Check rate limit (separate bucket from crash reports)
  const { allowed, remaining } = await checkRateLimitCustom(`ai-report:${clientIp}`, 10);
  if (!allowed) {
    console.log(`Rate limit exceeded for IP: ${clientIp}`);
    return {
      statusCode: 429,
      headers: {
        ...CORS_HEADERS,
        'X-RateLimit-Remaining': '0',
        'Retry-After': '3600',
      },
      body: JSON.stringify({
        success: false,
        error: 'Rate limit exceeded. Maximum 10 reports per hour.',
      }),
    };
  }

  // Parse body
  let body: unknown;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return respond(400, { success: false, error: 'Invalid JSON body' });
  }

  // Validate input
  const validation = validateAiReportInput(body);
  if (!validation.success) {
    return respond(400, { success: false, error: validation.error });
  }

  const input = validation.data;

  // Check if GITHUB_PAT is configured
  if (!GITHUB_PAT) {
    console.error('GITHUB_PAT environment variable not configured');
    return respond(500, { success: false, error: 'AI reporting not configured' });
  }

  // Create Gist with full content
  const gist = await createGist(
    input.system_prompt,
    input.conversation_transcript,
    input.shot_debug_log,
    input.provider_name,
    input.model_name
  );

  if (!gist) {
    return respond(500, { success: false, error: 'Failed to create report content' });
  }

  // Create GitHub issue with summary + Gist link
  const MAX_PREVIEW = 500;
  const codePoints = Array.from(input.conversation_transcript);
  const isTruncated = codePoints.length > MAX_PREVIEW;
  const conversationPreview = codePoints.slice(0, MAX_PREVIEW).join('');
  const issue = await createGitHubIssue(
    input.version,
    input.platform,
    input.device,
    input.provider_name,
    input.model_name,
    input.context_label,
    input.user_notes,
    conversationPreview,
    isTruncated,
    gist.url
  );

  if (!issue) {
    // Clean up orphaned Gist
    await deleteGist(gist.id);
    return respond(500, { success: false, error: 'Failed to create report issue' });
  }

  return {
    statusCode: 200,
    headers: {
      ...CORS_HEADERS,
      'X-RateLimit-Remaining': String(remaining),
    },
    body: JSON.stringify({
      success: true,
      issue_url: issue.url,
    }),
  };
}
