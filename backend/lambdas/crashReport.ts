import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { validateCrashReportInput } from '../shared/validate.js';
import { checkRateLimit } from '../shared/dynamo.js';
import type { CrashReportResponse } from '../shared/types.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_REPO = 'Kulitorum/Decenza';
const GITHUB_PAT = process.env.GITHUB_PAT || '';

function respond(statusCode: number, body: CrashReportResponse): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

/**
 * Sanitize user-provided text to prevent markdown injection
 * - Escape markdown special characters that could be used for injection
 * - Strip file paths that might contain usernames
 */
function sanitizeText(text: string): string {
  // Strip common path patterns that might contain usernames
  let sanitized = text
    .replace(/\/Users\/[^\/\s]+/g, '/Users/[redacted]')
    .replace(/\/home\/[^\/\s]+/g, '/home/[redacted]')
    .replace(/C:\\Users\\[^\\]+/g, 'C:\\Users\\[redacted]')
    .replace(/\\Users\\[^\\]+/g, '\\Users\\[redacted]');

  // Escape markdown link/image syntax to prevent injection
  sanitized = sanitized
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, '\\[$1\\]\\($2\\)')
    .replace(/!\[([^\]]*)\]\(([^)]*)\)/g, '!\\[$1\\]\\($2\\)');

  return sanitized;
}

/**
 * Extract crash signature for duplicate detection
 * Returns signal type and first few meaningful stack frames
 */
function extractCrashSignature(crashLog: string): { signal: string; frames: string[] } {
  // Try to extract signal type (e.g., SIGSEGV, SIGABRT)
  const signalMatch = crashLog.match(/Signal:\s*(\d+)\s*\((\w+)\)/i) ||
    crashLog.match(/(SIG\w+)/i) ||
    crashLog.match(/Exception:\s*(\w+)/i);
  const signal = signalMatch ? (signalMatch[2] || signalMatch[1]) : 'UNKNOWN';

  // Extract function names from stack frames
  const framePatterns = [
    /at\s+(\w+::\w+)/g,           // C++ style: at Foo::bar
    /in\s+(\w+)\s*\(/g,           // in functionName(
    /#\d+\s+[\da-fx]+\s+in\s+(\w+)/gi, // gdb style: #0 0x1234 in func
    /(\w+)\s*\+\s*0x[\da-f]+/gi,  // symbol+offset style
  ];

  const frames: string[] = [];
  for (const pattern of framePatterns) {
    const matches = crashLog.matchAll(pattern);
    for (const match of matches) {
      if (match[1] && !frames.includes(match[1]) && frames.length < 3) {
        frames.push(match[1]);
      }
    }
  }

  return { signal, frames };
}

/**
 * Search for existing similar crash reports
 */
async function findSimilarIssue(signal: string, frames: string[]): Promise<{ number: number; url: string } | null> {
  if (!GITHUB_PAT) return null;

  // Build search query
  const searchTerms = [
    `repo:${GITHUB_REPO}`,
    'is:open',
    'label:crash',
    signal !== 'UNKNOWN' ? `"${signal}"` : '',
    ...frames.slice(0, 2).map(f => `"${f}"`),
  ].filter(Boolean).join('+');

  try {
    const response = await fetch(
      `${GITHUB_API_BASE}/search/issues?q=${encodeURIComponent(searchTerms)}`,
      {
        headers: {
          'Authorization': `Bearer ${GITHUB_PAT}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'Decenza-DE1-CrashReporter',
        },
      }
    );

    if (!response.ok) {
      console.error('GitHub search failed:', response.status, await response.text());
      return null;
    }

    const data = await response.json() as { items?: Array<{ number: number; html_url: string }> };
    if (data.items && data.items.length > 0) {
      return { number: data.items[0].number, url: data.items[0].html_url };
    }
  } catch (error) {
    console.error('Error searching GitHub:', error);
  }

  return null;
}

/**
 * Add a comment to an existing issue
 */
async function addCommentToIssue(
  issueNumber: number,
  version: string,
  platform: string,
  device: string | undefined,
  crashLog: string,
  userNotes: string | undefined
): Promise<boolean> {
  if (!GITHUB_PAT) return false;

  const body = `## Additional Crash Report

**Version:** ${version}
**Platform:** ${platform}${device ? `\n**Device:** ${device}` : ''}
${userNotes ? `\n### User Notes\n${sanitizeText(userNotes)}` : ''}

### Crash Log
\`\`\`
${sanitizeText(crashLog.slice(0, 5000))}${crashLog.length > 5000 ? '\n... (truncated)' : ''}
\`\`\`

---
*Auto-reported by Decenza DE1 app*`;

  try {
    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${GITHUB_REPO}/issues/${issueNumber}/comments`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_PAT}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'Decenza-DE1-CrashReporter',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body }),
      }
    );

    return response.ok;
  } catch (error) {
    console.error('Error adding comment:', error);
    return false;
  }
}

/**
 * Create a new GitHub issue
 */
async function createGitHubIssue(
  version: string,
  platform: string,
  device: string | undefined,
  crashLog: string,
  userNotes: string | undefined,
  debugLogTail: string | undefined,
  signal: string
): Promise<{ url: string } | null> {
  if (!GITHUB_PAT) {
    console.error('GITHUB_PAT not configured');
    return null;
  }

  const title = `Crash Report: ${signal} - v${version} (${platform})`;

  const body = `## Crash Report

**Version:** ${version}
**Platform:** ${platform}${device ? `\n**Device:** ${device}` : ''}
${userNotes ? `\n### User Notes\n${sanitizeText(userNotes)}` : ''}

### Crash Log
\`\`\`
${sanitizeText(crashLog.slice(0, 10000))}${crashLog.length > 10000 ? '\n... (truncated)' : ''}
\`\`\`
${debugLogTail ? `\n### Debug Log (last lines)\n\`\`\`\n${sanitizeText(debugLogTail.slice(0, 5000))}${debugLogTail.length > 5000 ? '\n... (truncated)' : ''}\n\`\`\`` : ''}

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
          'User-Agent': 'Decenza-DE1-CrashReporter',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          body,
          labels: ['crash', 'auto-reported'],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GitHub issue creation failed:', response.status, errorText);
      return null;
    }

    const data = await response.json() as { html_url: string };
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

  // Get client IP for rate limiting
  const clientIp = event.requestContext.http.sourceIp || 'unknown';

  // Check rate limit
  const { allowed, remaining } = await checkRateLimit(clientIp);
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
        error: 'Rate limit exceeded. Maximum 10 crash reports per hour.',
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
  const validation = validateCrashReportInput(body);
  if (!validation.success) {
    return respond(400, { success: false, error: validation.error });
  }

  const input = validation.data;

  // Check if GITHUB_PAT is configured
  if (!GITHUB_PAT) {
    console.error('GITHUB_PAT environment variable not configured');
    return respond(500, { success: false, error: 'Crash reporting not configured' });
  }

  // Extract crash signature for duplicate detection
  const { signal, frames } = extractCrashSignature(input.crash_log);
  console.log(`Crash signature: ${signal}, frames: ${frames.join(', ')}`);

  // Search for similar existing issues
  const existingIssue = await findSimilarIssue(signal, frames);

  let issueUrl: string;

  if (existingIssue) {
    // Add comment to existing issue
    console.log(`Found similar issue #${existingIssue.number}, adding comment`);
    const commented = await addCommentToIssue(
      existingIssue.number,
      input.version,
      input.platform,
      input.device,
      input.crash_log,
      input.user_notes
    );

    if (!commented) {
      // Fall back to creating new issue if commenting failed
      const result = await createGitHubIssue(
        input.version,
        input.platform,
        input.device,
        input.crash_log,
        input.user_notes,
        input.debug_log_tail,
        signal
      );

      if (!result) {
        return respond(500, { success: false, error: 'Failed to create crash report' });
      }
      issueUrl = result.url;
    } else {
      issueUrl = existingIssue.url;
    }
  } else {
    // Create new issue
    const result = await createGitHubIssue(
      input.version,
      input.platform,
      input.device,
      input.crash_log,
      input.user_notes,
      input.debug_log_tail,
      signal
    );

    if (!result) {
      return respond(500, { success: false, error: 'Failed to create crash report' });
    }
    issueUrl = result.url;
  }

  return {
    statusCode: 200,
    headers: {
      ...CORS_HEADERS,
      'X-RateLimit-Remaining': String(remaining),
    },
    body: JSON.stringify({
      success: true,
      issue_url: issueUrl,
    }),
  };
}
