import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'tmail riellpedia - Instant Temporary Email Service',
  description: 'Fast, secure, and disposable temporary email service with auto-refreshing inbox by RIELLPEDIA.',
  keywords: ['temp mail', 'disposable email', 'temporary mailbox', 'riellpedia', 'anonymous mail'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-[#f7f4ee] text-[#09090b] antialiased selection:bg-purple-300 selection:text-black">
        {children}
      </body>
    </html>
  );
}
