/**
 * Sanitizes incoming HTML email bodies to prevent XSS, malicious script execution,
 * clickjacking via arbitrary iframes, and dangerous event handlers.
 * Built with pure JS regex for 100% crash-free Vercel serverless execution.
 */
export function sanitizeEmailHtml(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== 'string') return '';

  let clean = rawHtml;

  // 1. Remove script tags and contents
  clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // 2. Remove iframe, object, embed tags
  clean = clean.replace(/<(iframe|object|embed|form|input|button)\b[^>]*>(.*?<\/\1>)?/gi, '');

  // 3. Remove inline event handlers (onerror, onload, onclick, etc.)
  clean = clean.replace(/\s+on[a-z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '');

  // 4. Neutralize javascript: URLs
  clean = clean.replace(/href\s*=\s*(?:'javascript:[^']*'|"javascript:[^"]*"|javascript:[^\s>]+)/gi, 'href="#"');

  return clean;
}

/**
 * Escapes plain text for safe rendering in HTML containers.
 */
export function escapePlainText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
