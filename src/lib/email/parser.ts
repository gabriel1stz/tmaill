/**
 * Email Parser & OTP Extractor Utility for tmail riellpedia
 * Handles RFC 2047 encoded words, Quoted-Printable, Base64, Multipart MIME,
 * and Smart OTP Extraction.
 */

// 1. Decode RFC 2047 Encoded-Word headers (e.g. =?UTF-8?B?...?= or =?UTF-8?Q?...?=)
export function decodeHeaderWords(str: string): string {
  if (!str || typeof str !== 'string') return '';

  return str.replace(/=\?([^?]+)\?([BQbq])\?([^?]*)\?=/g, (_, charset, encoding, text) => {
    try {
      const enc = encoding.toUpperCase();
      if (enc === 'B') {
        const buffer = Buffer.from(text, 'base64');
        return buffer.toString('utf-8');
      } else if (enc === 'Q') {
        const unescaped = text.replace(/_/g, ' ');
        return decodeQuotedPrintable(unescaped);
      }
    } catch {
      return text;
    }
    return text;
  });
}

// 2. Decode Quoted-Printable strings
export function decodeQuotedPrintable(input: string): string {
  if (!input) return '';

  // Remove soft line breaks: '=\r\n' or '=\n'
  const normalized = input.replace(/=\r?\n/g, '');

  // Convert =XX hex sequences to binary bytes then decode as utf-8
  try {
    const bytes: number[] = [];
    for (let i = 0; i < normalized.length; i++) {
      if (normalized[i] === '=' && i + 2 < normalized.length) {
        const hex = normalized.substring(i + 1, i + 3);
        if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
          bytes.push(parseInt(hex, 16));
          i += 2;
          continue;
        }
      }
      bytes.push(normalized.charCodeAt(i));
    }
    return Buffer.from(bytes).toString('utf-8');
  } catch {
    return normalized.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return _;
      }
    });
  }
}

// 3. Decode Base64 safely
export function decodeBase64Safe(input: string): string {
  if (!input) return '';
  try {
    const clean = input.replace(/\s+/g, '');
    return Buffer.from(clean, 'base64').toString('utf-8');
  } catch {
    return input;
  }
}

// 4. Parse MIME Part (header + body)
export function parseMimePart(rawPart: string): { headers: Record<string, string>; body: string; contentType: string } {
  const headerEnd = rawPart.indexOf('\r\n\r\n');
  const altHeaderEnd = rawPart.indexOf('\n\n');
  
  let headerSection = '';
  let bodySection = rawPart;

  if (headerEnd !== -1) {
    headerSection = rawPart.substring(0, headerEnd);
    bodySection = rawPart.substring(headerEnd + 4);
  } else if (altHeaderEnd !== -1) {
    headerSection = rawPart.substring(0, altHeaderEnd);
    bodySection = rawPart.substring(altHeaderEnd + 2);
  }

  const headers: Record<string, string> = {};
  const headerLines = headerSection.split(/\r?\n/);
  let currentKey = '';

  for (const line of headerLines) {
    if (/^\s+/.test(line) && currentKey) {
      headers[currentKey] += ' ' + line.trim();
    } else {
      const match = line.match(/^([^:]+):\s*(.*)$/);
      if (match) {
        currentKey = match[1].toLowerCase();
        headers[currentKey] = match[2].trim();
      }
    }
  }

  const contentType = headers['content-type'] || 'text/plain';
  const transferEncoding = (headers['content-transfer-encoding'] || '').toLowerCase();

  let decodedBody = bodySection.trim();
  if (transferEncoding.includes('base64')) {
    decodedBody = decodeBase64Safe(decodedBody);
  } else if (transferEncoding.includes('quoted-printable')) {
    decodedBody = decodeQuotedPrintable(decodedBody);
  }

  return { headers, body: decodedBody, contentType };
}

// 5. Full Raw Email Parser (RFC 2822 / MIME)
export function parseRawEmail(rawText: string): {
  subject: string;
  sender: string;
  recipient: string;
  bodyText: string;
  bodyHtml: string;
  messageId: string;
} {
  if (!rawText) {
    return { subject: '', sender: '', recipient: '', bodyText: '', bodyHtml: '', messageId: '' };
  }

  // Find header-body boundary
  const splitPos = rawText.search(/\r?\n\r?\n/);
  const rawHeaders = splitPos !== -1 ? rawText.substring(0, splitPos) : '';
  const rawBody = splitPos !== -1 ? rawText.substring(splitPos).replace(/^\r?\n\r?\n/, '') : rawText;

  // Parse top headers
  const headers: Record<string, string> = {};
  let currentKey = '';
  for (const line of rawHeaders.split(/\r?\n/)) {
    if (/^\s+/.test(line) && currentKey) {
      headers[currentKey] += ' ' + line.trim();
    } else {
      const match = line.match(/^([^:]+):\s*(.*)$/);
      if (match) {
        currentKey = match[1].toLowerCase();
        headers[currentKey] = match[2].trim();
      }
    }
  }

  const subject = decodeHeaderWords(headers['subject'] || '');
  const sender = decodeHeaderWords(headers['from'] || '');
  const recipient = decodeHeaderWords(headers['to'] || headers['delivered-to'] || headers['x-forwarded-to'] || '');
  const messageId = headers['message-id'] || '';

  const mainContentType = headers['content-type'] || 'text/plain';
  const mainTransferEncoding = (headers['content-transfer-encoding'] || '').toLowerCase();

  let bodyText = '';
  let bodyHtml = '';

  // Check if multipart
  const boundaryMatch = mainContentType.match(/boundary="?([^";]+)"?/i);
  if (boundaryMatch && boundaryMatch[1]) {
    const boundary = boundaryMatch[1].trim();
    const parts = rawBody.split(new RegExp(`--${boundary}(?:--)?`));

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed || trimmed === '--') continue;

      const parsedPart = parseMimePart(trimmed);
      if (parsedPart.contentType.toLowerCase().includes('text/html')) {
        bodyHtml = parsedPart.body;
      } else if (parsedPart.contentType.toLowerCase().includes('text/plain')) {
        bodyText = parsedPart.body;
      } else if (parsedPart.contentType.toLowerCase().includes('multipart/')) {
        const nested = parseRawEmail(part);
        if (nested.bodyHtml && !bodyHtml) bodyHtml = nested.bodyHtml;
        if (nested.bodyText && !bodyText) bodyText = nested.bodyText;
      }
    }
  } else {
    // Single part
    let decoded = rawBody;
    if (mainTransferEncoding.includes('base64')) {
      decoded = decodeBase64Safe(decoded);
    } else if (mainTransferEncoding.includes('quoted-printable')) {
      decoded = decodeQuotedPrintable(decoded);
    }

    if (mainContentType.toLowerCase().includes('text/html')) {
      bodyHtml = decoded;
    } else {
      bodyText = decoded;
    }
  }

  // Fallback if text is missing but HTML exists
  if (!bodyText && bodyHtml) {
    bodyText = bodyHtml
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return {
    subject,
    sender,
    recipient,
    bodyText: bodyText.trim(),
    bodyHtml: bodyHtml.trim(),
    messageId,
  };
}

// 6. Smart OTP / Verification Code Extractor
export function extractOtpFromEmail(subject?: string | null, bodyText?: string | null, bodyHtml?: string | null): string | null {
  const cleanSubject = subject ? decodeHeaderWords(subject).trim() : '';
  let cleanText = bodyText || '';

  if (!cleanText && bodyHtml) {
    cleanText = bodyHtml
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&#[0-9]+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const searchCorpus = `${cleanSubject}\n\n${cleanText}`;

  // Priority 1: Direct OTP Keyword Context (Digits only or Alphanumeric with numbers)
  // e.g. "OTP: 123456", "verification code is 482910", "Kode verifikasi Anda adalah 839102", "G-123456"
  const keywordPattern = /(?:otp|kode\s*(?:verifikasi|rahasia|keamanan|konfirmasi|masuk)?|verification\s*code|verify\s*code|security\s*code|auth\s*code|passcode|confirm\s*code|login\s*code|pin)[\s\S]{0,35}?[:\s#=-]??\b([0-9]{4,8}|G-[0-9]{6}|[A-Z0-9]{5,8})\b/i;
  const matchKeyword = searchCorpus.match(keywordPattern);
  if (matchKeyword && matchKeyword[1]) {
    const candidate = matchKeyword[1].trim();
    // Must contain at least one digit and not be a plain word or year
    if (/\d/.test(candidate) && !['2024', '2025', '2026', '2027', '1999', '2000'].includes(candidate)) {
      return candidate;
    }
  }

  // Priority 2: Formats like 123-456 or 123 456
  const dashedMatch = searchCorpus.match(/\b([0-9]{3}[- ][0-9]{3})\b/);
  if (dashedMatch && dashedMatch[1]) {
    return dashedMatch[1].replace(/[- ]/g, '');
  }

  // Priority 3: Subject Line Standalone Code (e.g. "123456 is your Discord code" or "[123456]")
  if (cleanSubject) {
    const subjectMatch = cleanSubject.match(/\b([0-9]{4,8})\b/);
    if (subjectMatch && subjectMatch[1]) {
      const candidate = subjectMatch[1];
      if (!['2024', '2025', '2026', '2027'].includes(candidate)) {
        return candidate;
      }
    }
  }

  // Priority 4: Look for isolated 6-digit number in first 600 characters
  const shortSnippet = searchCorpus.substring(0, 600);
  const sixDigitMatches = shortSnippet.match(/\b([0-9]{6})\b/g);
  if (sixDigitMatches && sixDigitMatches.length > 0) {
    for (const match of sixDigitMatches) {
      if (!['2024', '2025', '2026', '2027'].includes(match)) {
        return match;
      }
    }
  }

  // Priority 5: 4-8 digit number near the top
  const anyDigitMatch = shortSnippet.match(/\b([0-9]{4,8})\b/);
  if (anyDigitMatch && anyDigitMatch[1]) {
    const candidate = anyDigitMatch[1];
    if (!['2024', '2025', '2026', '2027'].includes(candidate)) {
      return candidate;
    }
  }

  return null;
}
