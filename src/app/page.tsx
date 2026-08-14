'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Copy, RefreshCw, Plus, Clock, Trash2, Mail, ShieldCheck, 
  Check, Inbox, ChevronRight, Eye, AlertCircle, FileText, Sparkles, Smile
} from 'lucide-react';

interface DomainOption {
  id: string;
  domain: string;
}

interface EmailItem {
  id: string;
  sender: string;
  recipient: string;
  subject: string;
  snippet: string;
  size: number;
  isRead: boolean;
  receivedAt: string;
}

interface EmailDetail extends EmailItem {
  bodyText: string | null;
  bodyHtml: string | null;
}

export default function TempMailPage() {
  // Mailbox State
  const [token, setToken] = useState<string | null>(null);
  const [address, setAddress] = useState<string>('');
  const [domain, setDomain] = useState<string>('');
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [isExpired, setIsExpired] = useState<boolean>(false);
  const [loadingMailbox, setLoadingMailbox] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  // Domains State
  const [domains, setDomains] = useState<DomainOption[]>([]);
  const [selectedDomainId, setSelectedDomainId] = useState<string>('');
  const [customPrefix, setCustomPrefix] = useState<string>('');
  const [showCustomModal, setShowCustomModal] = useState<boolean>(false);

  // Inbox & Email State
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [loadingEmails, setLoadingEmails] = useState<boolean>(false);
  const [selectedEmail, setSelectedEmail] = useState<EmailDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [viewTab, setViewTab] = useState<'html' | 'text'>('html');
  const [errorMsg, setErrorMsg] = useState<string>('');

  // 1. Fetch available public domains
  const fetchDomains = useCallback(async () => {
    try {
      const res = await fetch('/api/domains');
      const data = await res.json();
      if (data.domains && data.domains.length > 0) {
        setDomains(data.domains);
        setSelectedDomainId(data.domains[0].id);
      }
    } catch (err) {
      console.error('Failed to load domains:', err);
    }
  }, []);

  // 2. Create new mailbox API call
  const createNewMailbox = async (opts?: { prefix?: string; domId?: string }) => {
    setLoadingMailbox(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/mailbox/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customPrefix: opts?.prefix || '',
          domainId: opts?.domId || '',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal membuat mailbox');
      }

      setToken(data.token);
      setAddress(data.address);
      setDomain(data.domain);
      setRemainingSeconds(data.remainingSeconds || data.ttlMinutes * 60);
      setIsExpired(false);
      setEmails([]);
      setSelectedEmail(null);

      localStorage.setItem('riell_tmail_token', data.token);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error saat membuat mailbox');
    } finally {
      setLoadingMailbox(false);
    }
  };

  // 3. Load Mailbox info via token
  const loadMailbox = useCallback(async (tokenStr: string) => {
    setLoadingMailbox(true);
    try {
      const res = await fetch(`/api/mailbox/${tokenStr}`);
      if (!res.ok) {
        localStorage.removeItem('riell_tmail_token');
        await createNewMailbox();
        return;
      }

      const data = await res.json();
      setToken(tokenStr);
      setAddress(data.address);
      setDomain(data.domain);
      setRemainingSeconds(data.remainingSeconds);
      setIsExpired(data.isExpired);
    } catch (err) {
      console.error('Error fetching mailbox details:', err);
    } finally {
      setLoadingMailbox(false);
    }
  }, []);

  // 4. Fetch Emails for active mailbox
  const fetchEmails = useCallback(async (tokenStr: string, silent = false) => {
    if (!silent) setLoadingEmails(true);
    try {
      const res = await fetch(`/api/mailbox/${tokenStr}/emails`);
      if (res.ok) {
        const data = await res.json();
        setEmails(data.emails || []);
      }
    } catch (err) {
      console.error('Error fetching emails:', err);
    } finally {
      if (!silent) setLoadingEmails(false);
    }
  }, []);

  // 5. Open and view single email detail
  const openEmail = async (emailId: string) => {
    if (!token) return;
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/mailbox/${token}/emails/${emailId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedEmail(data);
        setEmails((prev) =>
          prev.map((e) => (e.id === emailId ? { ...e, isRead: true } : e))
        );
      }
    } catch (err) {
      console.error('Error opening email detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  // 6. Delete email item
  const deleteEmail = async (emailId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/mailbox/${token}/emails/${emailId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setEmails((prev) => prev.filter((e) => e.id !== emailId));
        if (selectedEmail?.id === emailId) {
          setSelectedEmail(null);
        }
      }
    } catch (err) {
      console.error('Error deleting email:', err);
    }
  };

  // Initialize on mount
  useEffect(() => {
    fetchDomains();
    const savedToken = localStorage.getItem('riell_tmail_token');
    if (savedToken) {
      loadMailbox(savedToken);
    } else {
      createNewMailbox();
    }
  }, [fetchDomains, loadMailbox]);

  // Expiration countdown timer
  useEffect(() => {
    if (remainingSeconds <= 0) {
      if (remainingSeconds === 0 && address) {
        setIsExpired(true);
      }
      return;
    }

    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          setIsExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [remainingSeconds, address]);

  // Auto-polling for new emails every 5 seconds
  useEffect(() => {
    if (!token || isExpired) return;

    fetchEmails(token, true);
    const interval = setInterval(() => {
      fetchEmails(token, true);
    }, 5000);

    return () => clearInterval(interval);
  }, [token, isExpired, fetchEmails]);

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="bg-white border-b-4 border-black sticky top-0 z-40 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 bg-amber-300 border-3 border-black rounded-2xl flex items-center justify-center shadow-[3px_3px_0px_0px_#18181b]">
              <Mail className="w-6 h-6 text-black" />
            </div>
            <div>
              <span className="text-2xl font-black font-heading tracking-tight text-black flex items-center gap-1.5">
                tmail <span className="bg-purple-300 px-2 py-0.5 rounded-lg border-2 border-black">riellpedia</span>
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="px-3 py-1 bg-emerald-300 border-2 border-black rounded-full text-xs font-bold text-black flex items-center gap-1.5 shadow-[2px_2px_0px_0px_#18181b]">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-700 animate-ping" />
              <span>Instan Mail Ready</span>
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 space-y-8">
        
        {errorMsg && (
          <div className="p-4 rounded-xl bg-rose-200 border-3 border-black text-black font-bold text-sm flex items-center justify-between shadow-[4px_4px_0px_0px_#18181b]">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-5 h-5" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg('')} className="text-xs underline font-bold">Tutup</button>
          </div>
        )}

        {/* Semi-Cartoon Hero Card */}
        <section className="cartoon-box-yellow p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black font-heading text-black flex items-center gap-2">
                <span>Alamat Email Sementara Kamu</span>
                <Smile className="w-7 h-7 text-purple-700 inline-block" />
              </h1>
              <p className="text-xs sm:text-sm font-semibold text-black/80 mt-1">
                Gunakan email instan ini untuk daftar akun & terima OTP tanpa spam!
              </p>
            </div>

            {/* Countdown Badge */}
            <div className="px-4 py-2 bg-white border-3 border-black rounded-xl flex items-center space-x-2 shadow-[3px_3px_0px_0px_#18181b] self-start sm:self-auto">
              <Clock className="w-4 h-4 text-black" />
              <span className="text-xs font-bold text-black">Hangus dalam:</span>
              <span className={`text-sm font-mono font-black ${isExpired ? 'text-rose-600' : 'text-purple-700'}`}>
                {isExpired ? 'EXPIRED' : formatTime(remainingSeconds)}
              </span>
            </div>
          </div>

          {/* Email Address Display Box */}
          <div className="flex flex-col sm:flex-row items-stretch gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                readOnly
                value={loadingMailbox ? 'Membuat email instan...' : address}
                className="w-full h-14 pl-4 pr-12 rounded-xl bg-white border-3 border-black text-black font-mono text-lg font-black tracking-wide shadow-[3px_3px_0px_0px_#18181b] focus:outline-none"
              />
              {loadingMailbox && (
                <div className="absolute right-4 top-4">
                  <RefreshCw className="w-6 h-6 text-black animate-spin" />
                </div>
              )}
            </div>

            <button
              onClick={handleCopy}
              disabled={loadingMailbox || !address}
              className={`cartoon-btn h-14 px-7 rounded-xl text-black font-black flex items-center justify-center space-x-2 ${
                copied ? 'bg-emerald-400' : 'bg-cyan-300 hover:bg-cyan-400'
              }`}
            >
              {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
              <span>{copied ? 'Tersalin!' : 'Salin Email'}</span>
            </button>
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t-2 border-black/20">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => createNewMailbox()}
                disabled={loadingMailbox}
                className="cartoon-btn px-4 py-2.5 rounded-xl bg-white text-xs font-black text-black flex items-center space-x-1.5 hover:bg-gray-100"
              >
                <RefreshCw className={`w-4 h-4 text-black ${loadingMailbox ? 'animate-spin' : ''}`} />
                <span>Acak Email Baru</span>
              </button>

              <button
                onClick={() => setShowCustomModal(true)}
                disabled={loadingMailbox}
                className="cartoon-btn px-4 py-2.5 rounded-xl bg-purple-300 hover:bg-purple-400 text-xs font-black text-black flex items-center space-x-1.5"
              >
                <Plus className="w-4 h-4 text-black" />
                <span>Bikin Custom Email</span>
              </button>
            </div>

            <button
              onClick={() => token && fetchEmails(token)}
              disabled={loadingEmails}
              className="cartoon-btn px-4 py-2.5 rounded-xl bg-emerald-300 hover:bg-emerald-400 text-xs font-black text-black flex items-center space-x-1.5"
            >
              <RefreshCw className={`w-4 h-4 ${loadingEmails ? 'animate-spin' : ''}`} />
              <span>Cek Pesan</span>
            </button>
          </div>
        </section>

        {/* Inbox Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <h2 className="text-xl font-black font-heading text-black flex items-center gap-2">
                <Inbox className="w-6 h-6 text-black" />
                <span>Kotak Masuk (Inbox)</span>
              </h2>
              <span className="px-3 py-1 rounded-full text-xs font-black bg-purple-300 border-2 border-black shadow-[2px_2px_0px_0px_#18181b]">
                {emails.length} Pesan
              </span>
            </div>
          </div>

          {/* Messages Container */}
          <div className="cartoon-box p-2 divide-y-2 divide-black">
            {loadingEmails && emails.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-black animate-spin mx-auto" />
                <p className="text-sm font-bold text-black">Memuat pesan baru...</p>
              </div>
            ) : emails.length === 0 ? (
              <div className="p-12 text-center space-y-4">
                <div className="w-16 h-16 bg-cyan-200 border-3 border-black rounded-2xl flex items-center justify-center mx-auto shadow-[3px_3px_0px_0px_#18181b]">
                  <Mail className="w-8 h-8 text-black" />
                </div>
                <div className="max-w-md mx-auto space-y-1">
                  <h3 className="text-base font-black text-black">Belum ada email masuk</h3>
                  <p className="text-xs font-semibold text-black/70">
                    Kirim email ke <span className="font-mono font-bold bg-amber-200 px-1.5 py-0.5 rounded border border-black">{address}</span>. Pesan baru akan otomatis muncul di sini!
                  </p>
                </div>
              </div>
            ) : (
              emails.map((email) => (
                <div
                  key={email.id}
                  onClick={() => openEmail(email.id)}
                  className={`p-4 flex items-center justify-between gap-4 cursor-pointer transition-all hover:bg-amber-100 rounded-xl my-1 ${
                    !email.isRead ? 'bg-purple-100 font-bold' : ''
                  }`}
                >
                  <div className="flex items-center space-x-3.5 min-w-0 flex-1">
                    <div className={`w-10 h-10 rounded-xl border-2 border-black flex items-center justify-center shrink-0 shadow-[2px_2px_0px_0px_#18181b] ${
                      !email.isRead ? 'bg-purple-300' : 'bg-gray-200'
                    }`}>
                      <Mail className="w-5 h-5 text-black" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-black truncate text-black">{email.sender}</span>
                        {!email.isRead && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-400 border border-black text-black">
                            BARU
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-bold text-black truncate">{email.subject}</h4>
                      <p className="text-xs text-black/70 truncate">{email.snippet || 'Tidak ada preview'}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 shrink-0">
                    <span className="text-xs font-mono font-bold text-black">
                      {new Date(email.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteEmail(email.id);
                      }}
                      className="p-2 rounded-lg bg-rose-200 hover:bg-rose-300 border-2 border-black text-black transition-colors"
                      title="Hapus Pesan"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-black" />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t-4 border-black py-6 mt-12 text-center text-xs font-bold text-black">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 tmail riellpedia. Instant Anonymous Temp Mail System.</p>
          <div className="flex items-center space-x-2">
            <span className="px-3 py-1 bg-green-200 border-2 border-black rounded-lg text-black font-bold">
              Domains: pedia.biz.id & empruy.my.id
            </span>
          </div>
        </div>
      </footer>

      {/* Modal: Custom Email Address Generator */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="cartoon-box-cyan w-full max-w-md p-6 space-y-6 shadow-[6px_6px_0px_0px_#18181b]">
            <div className="flex items-center justify-between border-b-2 border-black pb-3">
              <h3 className="text-lg font-black text-black flex items-center gap-2">
                <Plus className="w-5 h-5 text-black" />
                <span>Buat Custom Email</span>
              </h3>
              <button
                onClick={() => setShowCustomModal(false)}
                className="w-8 h-8 rounded-lg bg-white border-2 border-black text-black font-black flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-black text-black mb-1 block">Username / Awalan Email</label>
                <input
                  type="text"
                  placeholder="contoh: riell.ganteng"
                  value={customPrefix}
                  onChange={(e) => setCustomPrefix(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl bg-white border-3 border-black text-black font-mono text-sm font-bold focus:outline-none shadow-[2px_2px_0px_0px_#18181b]"
                />
              </div>

              <div>
                <label className="text-xs font-black text-black mb-1 block">Pilih Domain Email</label>
                <select
                  value={selectedDomainId}
                  onChange={(e) => setSelectedDomainId(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl bg-white border-3 border-black text-black font-bold text-sm focus:outline-none shadow-[2px_2px_0px_0px_#18181b]"
                >
                  {domains.map((d) => (
                    <option key={d.id} value={d.id}>
                      @{d.domain}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setShowCustomModal(false)}
                className="cartoon-btn px-4 py-2.5 rounded-xl bg-white text-xs font-black text-black"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  setShowCustomModal(false);
                  createNewMailbox({ prefix: customPrefix, domId: selectedDomainId });
                }}
                className="cartoon-btn px-5 py-2.5 rounded-xl bg-purple-300 hover:bg-purple-400 text-black text-xs font-black"
              >
                Buat Email
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: View Full Email Content */}
      {selectedEmail && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <div className="cartoon-box w-full max-w-4xl my-auto overflow-hidden flex flex-col max-h-[90vh] shadow-[8px_8px_0px_0px_#18181b]">
            {/* Modal Header */}
            <div className="p-6 border-b-3 border-black bg-amber-200 flex items-start justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <h3 className="text-xl font-black text-black truncate">{selectedEmail.subject}</h3>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold text-black font-mono">
                  <span>Dari: <strong className="bg-white px-1.5 py-0.5 rounded border border-black">{selectedEmail.sender}</strong></span>
                  <span>Kepada: {selectedEmail.recipient}</span>
                  <span>Waktu: {new Date(selectedEmail.receivedAt).toLocaleString()}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedEmail(null)}
                className="w-9 h-9 rounded-xl bg-white border-2 border-black font-black text-black flex items-center justify-center shrink-0"
              >
                ✕
              </button>
            </div>

            {/* View Mode Tabs */}
            <div className="px-6 py-3 border-b-2 border-black bg-gray-100 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setViewTab('html')}
                  className={`cartoon-btn px-3 py-1.5 rounded-lg text-xs font-black flex items-center space-x-1.5 ${
                    viewTab === 'html' ? 'bg-purple-300 text-black' : 'bg-white text-black'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>HTML View</span>
                </button>
                <button
                  onClick={() => setViewTab('text')}
                  className={`cartoon-btn px-3 py-1.5 rounded-lg text-xs font-black flex items-center space-x-1.5 ${
                    viewTab === 'text' ? 'bg-purple-300 text-black' : 'bg-white text-black'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Plaintext</span>
                </button>
              </div>

              <button
                onClick={() => deleteEmail(selectedEmail.id)}
                className="cartoon-btn px-3 py-1.5 rounded-lg bg-rose-300 text-black text-xs font-black flex items-center space-x-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus Email</span>
              </button>
            </div>

            {/* Email Content Body */}
            <div className="p-6 overflow-y-auto flex-1 bg-white text-black min-h-[300px]">
              {loadingDetail ? (
                <div className="p-12 text-center space-y-2">
                  <RefreshCw className="w-8 h-8 text-black animate-spin mx-auto" />
                  <p className="text-sm font-bold text-black">Memuat isi pesan...</p>
                </div>
              ) : viewTab === 'html' && selectedEmail.bodyHtml ? (
                <div
                  className="prose max-w-none text-sm font-sans"
                  dangerouslySetInnerHTML={{ __html: selectedEmail.bodyHtml }}
                />
              ) : (
                <pre className="whitespace-pre-wrap font-mono text-sm text-black bg-amber-50 p-4 rounded-xl border-2 border-black">
                  {selectedEmail.bodyText || 'Tidak ada teks isi email.'}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
