import { z } from 'zod';

export const adminLoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const addDomainSchema = z.object({
  domain: z
    .string()
    .min(3, 'Domain name too short')
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Invalid domain format'),
});

export const createMailboxSchema = z.object({
  domainId: z.string().optional(),
  customPrefix: z.string().max(30).optional(),
});

export const incomingEmailSchema = z.object({
  recipient: z.string().email(),
  sender: z.string(),
  subject: z.string().default('(No Subject)'),
  bodyText: z.string().optional(),
  bodyHtml: z.string().optional(),
  messageId: z.string().optional(),
  size: z.number().default(0),
});

export const updateSettingsSchema = z.object({
  mailboxLifetimeMinutes: z.number().min(1).max(1440).optional(),
  maxEmailsPerMailbox: z.number().min(1).max(500).optional(),
  maxEmailSizeBytes: z.number().min(100000).max(50000000).optional(),
  mailboxCreationLimitPerHour: z.number().min(1).max(1000).optional(),
  autoDeleteExpired: z.boolean().optional(),
  maintenanceMode: z.boolean().optional(),
  defaultDomainId: z.string().optional(),
  turnstileEnabled: z.boolean().optional(),
  turnstileSiteKey: z.string().optional(),
  turnstileSecretKey: z.string().optional(),
});
