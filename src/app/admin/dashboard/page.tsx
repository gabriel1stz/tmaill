'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Globe, Mail, Shield, Server, RefreshCw, Plus, Trash2, 
  LogOut, Settings, Activity, Check, ArrowLeft, Key, Lock,
  Copy, Terminal, Cpu, Database, AlertCircle, Sparkles, Eye, EyeOff, Wrench
} from 'lucide-react';
import Link from 'next/link';

interface StatsData {
  activeMailboxes: number;
  totalMailboxes: number;
  totalEmails: number;
  totalDomains: number;
  activeDomains: number;
  recentLogs: Array<{
    id: string;
    action: string;
    metadata: string | null;
    createdAt: string;
  }>;
}

interface DomainItem {
  id: string;
  domain: string;
  status: string;
  verificationStatus: string;
  verificationToken: string;
  mxTarget: string;
  createdAt: string;
  _count?: { mailboxes: number };
}

interface HealthData {
  status: string;
  dbLatencyMs: number;
  expiredMailboxesCount: number;
  totalLogsCount: number;
  nodeVersion: string;
  uptimeSeconds: number;
}

export default function AdminDashboardPage() {
  const router = useRouter();

  const [stats, setStats] = useState<StatsData | null>(null);
  const [domains, setDomains] = useState<DomainItem[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [health, setHealth] = useState<HealthData | null>(null);
  const [apiKey, setApiKey] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Add Domain form state
  const [newDomain, setNewDomain] = useState<string>('');
  const [newMxTarget, setNewMxTarget] = useState<string>('in1-smtp.messagingengine.com');
  const [addingDomain, setAddingDomain] = useState<boolean>(false);

  // Settings form state (Default 10080 minutes = 7 days)
  const [ttlMinutes, setTtlMinutes] = useState<string>('10080');
  const [creationLimit, setCreationLimit] = useState<string>('10');
  const [savingSettings, setSavingSettings] = useState<boolean>(false);
  const [savedSettingsSuccess, setSavedSettingsSuccess] = useState<boolean>(false);

  // Change Password form state
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [savingPassword, setSavingPassword] = useState<boolean>(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Maintenance action state
  const [purging, setPurging] = useState<boolean>(false);
  const [clearingLogs, setClearingLogs] = useState<boolean>(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState<string>('');

  // Code Snippet Tab state
  const [snippetTab, setSnippetTab] = useState<'curl' | 'python' | 'node'>('python');

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, domainsRes, settingsRes, keyRes, healthRes] = await Promise.all([
        fetch('/api/admin/stats'),
        fetch('/api/admin/domains'),
        fetch('/api/admin/settings'),
        fetch('/api/admin/apikey'),
        fetch('/api/admin/maintenance'),
      ]);

      if (statsRes.status === 401 || domainsRes.status === 401) {
        router.push('/admin/login');
        return;
      }

      const statsData = await statsRes.json();
      const domainsData = await domainsRes.json();
      const settingsData = await settingsRes.json();
      const keyData = await keyRes.json();
      const healthData = await healthRes.json();

      setStats(statsData);
      setDomains(domainsData.domains || []);
      setSettings(settingsData.settings || {});
      if (keyData.apiKey) setApiKey(keyData.apiKey);
      if (healthData.status) setHealth(healthData);

      if (settingsData.settings?.mailbox_lifetime_minutes) {
        setTtlMinutes(settingsData.settings.mailbox_lifetime_minutes);
      } else {
        setTtlMinutes('10080');
      }
      if (settingsData.settings?.creation_limit_per_hour) {
        setCreationLimit(settingsData.settings.creation_limit_per_hour);
      }
    } catch (err: any) {
      console.error('Error loading dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/admin/login');
  };

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain) return;
    setAddingDomain(true);
    try {
      const res = await fetch('/api/admin/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: newDomain, mxTarget: newMxTarget }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add domain');

      setNewDomain('');
      loadDashboardData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setAddingDomain(false);
    }
  };

  const handleVerifyDomain = async (id: string) => {
    try {
      const res = await fetch('/api/admin/domains', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'verify' }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed');
      alert(`DNS Status: ${data.dnsDetails.message}`);
      loadDashboardData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleToggleDomainStatus = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      const res = await fetch('/api/admin/domains', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: nextStatus }),
      });
      if (res.ok) loadDashboardData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteDomain = async (id: string) => {
    if (!confirm('Hapus domain ini dari daftar?')) return;
    try {
      const res = await fetch(`/api/admin/domains?id=${id}`, { method: 'DELETE' });
      if (res.ok) loadDashboardData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSavedSettingsSuccess(false);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mailbox_lifetime_minutes: ttlMinutes,
          creation_limit_per_hour: creationLimit,
        }),
      });
      if (res.ok) {
        setSavedSettingsSuccess(true);
        setTimeout(() => setSavedSettingsSuccess(false), 3000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);

    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'Konfirmasi password baru tidak cocok!' });
      return;
    }

    if (newPassword.length < 8) {
      setPasswordMsg({ type: 'error', text: 'Password baru minimal 8 karakter!' });
      return;
    }

    setSavingPassword(true);
    try {
      const res = await fetch('/api/admin/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengubah password');
      }

      setPasswordMsg({ type: 'success', text: data.message || 'Password berhasil diperbarui!' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordMsg(null), 4000);
    } catch (err: any) {
      setPasswordMsg({ type: 'error', text: err.message || 'Error mengubah password' });
    } finally {
      setSavingPassword(false);
    }
  };

  const handleRotateApiKey = async () => {
    if (!confirm('Apakah kamu yakin ingin merotasi API Key? API Key lama tidak akan bisa digunakan lagi oleh bot.')) return;
    try {
      const res = await fetch('/api/admin/apikey', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.apiKey) {
        setApiKey(data.apiKey);
        alert('API Key baru berhasil dibuat!');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCopyKey = () => {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleCopySnippet = (snippet: string, keyName: string) => {
    navigator.clipboard.writeText(snippet);
    setCopiedSnippet(keyName);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  const handlePurgeExpired = async () => {
    if (!confirm('Bersihkan semua mailbox yang sudah kedaluwarsa?')) return;
    setPurging(true);
    try {
      const res = await fetch('/api/admin/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'purge_expired' }),
      });
      const data = await res.json();
      if (res.ok) {
        setMaintenanceMsg(data.message);
        setTimeout(() => setMaintenanceMsg(''), 4000);
        loadDashboardData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPurging(false);
    }
  };

  const handleClearLogs = async () => {
    if (!confirm('Hapus semua riwayat system audit log? Tindakan ini tidak dapat dibatalkan.')) return;
    setClearingLogs(true);
    try {
      const res = await fetch('/api/admin/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_logs' }),
      });
      const data = await res.json();
      if (res.ok) {
        setMaintenanceMsg(data.message);
        setTimeout(() => setMaintenanceMsg(''), 4000);
        loadDashboardData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setClearingLogs(false);
    }
  };

  // Code snippets for developers & bot makers
  const curlCode = `# 1. Create Temporary Mailbox (Bypassing Rate Limit)
curl -X POST https://r1el.my.id/api/mailbox/create \\
  -H "Content-Type: application/json" \\
  -H "X-Api-Key: ${apiKey || 'YOUR_ADMIN_API_KEY'}" \\
  -d '{"customPrefix": "bot.test"}'

# 2. Poll Messages & Read OTP
curl https://r1el.my.id/api/mailbox/<TOKEN>/emails`;

  const pythonCode = `import requests
import time

API_KEY = "${apiKey || 'YOUR_ADMIN_API_KEY'}"
BASE_URL = "https://r1el.my.id"

# 1. Create Mailbox with API Key
res = requests.post(
    f"{BASE_URL}/api/mailbox/create",
    json={"customPrefix": "riell_bot"},
    headers={"X-Api-Key": API_KEY}
)
data = res.json()
email_address = data["address"]
token = data["token"]
print(f"[+] Mailbox Created: {email_address}")

# 2. Wait and check for incoming OTP
print("[*] Waiting for incoming verification email...")
for _ in range(30):
    time.sleep(3)
    inbox = requests.get(f"{BASE_URL}/api/mailbox/{token}/emails").json()
    if inbox.get("emails"):
        latest = inbox["emails"][0]
        print(f"[+] Subject: {latest['subject']}")
        print(f"[🔥] Extracted OTP: {latest.get('otp')}")
        break`;

  const nodeCode = `const API_KEY = "${apiKey || 'YOUR_ADMIN_API_KEY'}";
const BASE_URL = "https://r1el.my.id";

async function main() {
  // 1. Create Mailbox
  const createRes = await fetch(\`\${BASE_URL}/api/mailbox/create\`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": API_KEY,
    },
    body: JSON.stringify({ customPrefix: "node_bot" }),
  });
  const { address, token } = await createRes.json();
  console.log(\`[+] Email: \${address}\`);

  // 2. Poll for OTP
  setInterval(async () => {
    const res = await fetch(\`\${BASE_URL}/api/mailbox/\${token}/emails\`);
    const { emails } = await res.json();
    if (emails && emails.length > 0) {
      console.log(\`[🔥] OTP: \${emails[0].otp}\`);
    }
  }, 3000);
}
main();`;

  if (loading && !stats) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f7f4ee]">
        <div className="text-center space-y-3 font-bold text-black">
          <RefreshCw className="w-8 h-8 text-black animate-spin mx-auto" />
          <p className="text-sm">Memuat Admin Control Panel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f7f4ee] font-sans text-black">
      {/* Header */}
      <header className="bg-white border-b-4 border-black sticky top-0 z-40 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/" className="p-2 rounded-xl bg-purple-200 border-2 border-black text-black font-black flex items-center gap-1 hover:bg-purple-300">
              <ArrowLeft className="w-4 h-4" />
              <span className="text-xs">Ke Temp Mail</span>
            </Link>
            <div className="flex items-center space-x-2">
              <Shield className="w-6 h-6 text-black" />
              <span className="font-black text-xl font-heading text-black">Admin Dashboard</span>
              <span className="text-xs px-2.5 py-0.5 rounded-lg bg-amber-300 border-2 border-black font-black text-black">
                tmail riellpedia
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={loadDashboardData}
              className="p-2 rounded-xl bg-white border-2 border-black text-black font-black hover:bg-gray-100 shadow-[2px_2px_0px_0px_#000]"
              title="Refresh Data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={handleLogout}
              className="cartoon-btn px-3 py-1.5 rounded-xl bg-rose-300 text-black text-xs font-black flex items-center space-x-1.5"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 space-y-8">
        
        {/* Stat Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="cartoon-box-purple p-5 space-y-2">
            <div className="flex items-center justify-between text-black">
              <span className="text-xs font-black">Active Mailboxes</span>
              <Mail className="w-5 h-5 text-black" />
            </div>
            <p className="text-3xl font-black text-black">{stats?.activeMailboxes || 0}</p>
            <p className="text-xs font-bold text-black/80">{stats?.totalMailboxes || 0} Total dibuat</p>
          </div>

          <div className="cartoon-box-cyan p-5 space-y-2">
            <div className="flex items-center justify-between text-black">
              <span className="text-xs font-black">Total Emails Received</span>
              <Server className="w-5 h-5 text-black" />
            </div>
            <p className="text-3xl font-black text-black">{stats?.totalEmails || 0}</p>
            <p className="text-xs font-bold text-black/80">Inbound & OTP terproses</p>
          </div>

          <div className="cartoon-box-green p-5 space-y-2">
            <div className="flex items-center justify-between text-black">
              <span className="text-xs font-black">Registered Domains</span>
              <Globe className="w-5 h-5 text-black" />
            </div>
            <p className="text-3xl font-black text-black">{stats?.totalDomains || 0}</p>
            <p className="text-xs font-black text-black">{stats?.activeDomains || 0} Aktif & Operasional</p>
          </div>

          <div className="cartoon-box-yellow p-5 space-y-2">
            <div className="flex items-center justify-between text-black">
              <span className="text-xs font-black">Database Health</span>
              <Database className="w-5 h-5 text-black" />
            </div>
            <div className="flex items-baseline space-x-2">
              <p className="text-3xl font-black text-black">{health?.dbLatencyMs ?? 0}ms</p>
              <span className="text-xs font-black text-emerald-800 bg-emerald-300 px-1.5 py-0.5 rounded border border-black">
                {health?.status === 'healthy' ? 'Normal' : 'Warning'}
              </span>
            </div>
            <p className="text-xs font-bold text-black/80">Node.js {health?.nodeVersion || 'v20'}</p>
          </div>
        </div>

        {/* Domain Management Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black font-heading text-black flex items-center gap-2">
              <Globe className="w-6 h-6 text-black" />
              <span>Kelola Domain Email</span>
            </h2>
          </div>

          {/* Add Domain Form */}
          <form onSubmit={handleAddDomain} className="cartoon-box p-4 flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              required
              placeholder="e.g. domainmu.com"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              className="flex-1 h-11 px-4 rounded-xl bg-white border-2 border-black text-sm font-bold text-black focus:outline-none shadow-[2px_2px_0px_0px_#000]"
            />
            <input
              type="text"
              required
              placeholder="MX Target (default: in1-smtp.messagingengine.com)"
              value={newMxTarget}
              onChange={(e) => setNewMxTarget(e.target.value)}
              className="flex-1 h-11 px-4 rounded-xl bg-white border-2 border-black text-sm font-bold text-black focus:outline-none shadow-[2px_2px_0px_0px_#000]"
            />
            <button
              type="submit"
              disabled={addingDomain}
              className="cartoon-btn px-6 h-11 rounded-xl bg-purple-300 hover:bg-purple-400 text-black font-black text-xs flex items-center justify-center space-x-1.5 shrink-0"
            >
              <Plus className="w-4 h-4 text-black" />
              <span>{addingDomain ? 'Menambahkan...' : 'Tambah Domain'}</span>
            </button>
          </form>

          {/* Domains Table List */}
          <div className="cartoon-box overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-amber-200 border-b-3 border-black text-black font-black">
                    <th className="p-3.5">Domain</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5">DNS Verification</th>
                    <th className="p-3.5">Mailboxes</th>
                    <th className="p-3.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-black font-mono">
                  {domains.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-black font-bold font-sans">
                        Belum ada domain terdaftar.
                      </td>
                    </tr>
                  ) : (
                    domains.map((d) => (
                      <tr key={d.id} className="hover:bg-amber-50">
                        <td className="p-3.5 font-bold text-black">{d.domain}</td>
                        <td className="p-3.5">
                          <span className={`px-2 py-0.5 rounded border border-black text-[10px] font-black ${
                            d.status === 'ACTIVE' ? 'bg-emerald-300 text-black' : 'bg-gray-200 text-black'
                          }`}>
                            {d.status}
                          </span>
                        </td>
                        <td className="p-3.5 font-sans text-black font-bold">{d.verificationStatus}</td>
                        <td className="p-3.5 font-bold text-black">{d._count?.mailboxes || 0}</td>
                        <td className="p-3.5 text-right space-x-2">
                          <button
                            onClick={() => handleVerifyDomain(d.id)}
                            className="cartoon-btn px-2.5 py-1 rounded-lg bg-cyan-300 text-[10px] font-black text-black"
                          >
                            Cek DNS
                          </button>
                          <button
                            onClick={() => handleToggleDomainStatus(d.id, d.status)}
                            className="cartoon-btn px-2.5 py-1 rounded-lg bg-yellow-300 text-[10px] font-black text-black"
                          >
                            {d.status === 'ACTIVE' ? 'Nonaktifkan' : 'Aktifkan'}
                          </button>
                          <button
                            onClick={() => handleDeleteDomain(d.id)}
                            className="p-1 rounded-lg bg-rose-200 hover:bg-rose-300 border-2 border-black text-black inline-flex items-center justify-center align-middle"
                            title="Hapus Domain"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* API KEY & BOT INTEGRATION SECTION */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black font-heading text-black flex items-center gap-2">
              <Key className="w-6 h-6 text-black" />
              <span>Master API Key & Bot Automation</span>
            </h2>
            <span className="px-3 py-1 bg-purple-300 border-2 border-black rounded-lg text-xs font-black text-black">
              Bot Rate-Limit Bypass Ready
            </span>
          </div>

          <div className="cartoon-box-purple p-6 space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-black block">
                  Admin Master API Key
                </label>
                <span className="text-[11px] font-bold text-black/80">
                  Gunakan header <code className="bg-white px-1.5 py-0.5 rounded border border-black font-mono font-bold">X-Api-Key: &lt;KEY&gt;</code> untuk bypass limit.
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch gap-2.5">
                <div className="relative flex-1">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    readOnly
                    value={apiKey || 'Memuat API Key...'}
                    className="w-full h-11 pl-4 pr-12 rounded-xl bg-white border-2 border-black text-black font-mono text-sm font-black focus:outline-none shadow-[2px_2px_0px_0px_#000]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-2.5 p-1 text-black hover:text-purple-900"
                    title={showApiKey ? 'Sembunyikan' : 'Tampilkan'}
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <button
                  onClick={handleCopyKey}
                  className={`cartoon-btn px-5 h-11 rounded-xl text-xs font-black text-black flex items-center justify-center space-x-1.5 ${
                    copiedKey ? 'bg-emerald-400' : 'bg-cyan-300 hover:bg-cyan-400'
                  }`}
                >
                  {copiedKey ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedKey ? 'Tersalin!' : 'Salin API Key'}</span>
                </button>

                <button
                  onClick={handleRotateApiKey}
                  className="cartoon-btn px-4 h-11 rounded-xl bg-rose-300 hover:bg-rose-400 text-xs font-black text-black flex items-center justify-center space-x-1.5"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Rotasi API Key</span>
                </button>
              </div>
            </div>

            {/* Developer Code Snippets Tabs */}
            <div className="space-y-3 pt-4 border-t-2 border-black/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-black flex items-center gap-1.5">
                  <Terminal className="w-4 h-4" />
                  <span>Contoh Integrasi Bot Auto-Create Mailbox & Baca OTP</span>
                </span>

                <div className="flex items-center space-x-1 bg-white p-1 rounded-xl border-2 border-black">
                  <button
                    onClick={() => setSnippetTab('python')}
                    className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${
                      snippetTab === 'python' ? 'bg-amber-300 text-black border border-black' : 'text-black/70'
                    }`}
                  >
                    Python
                  </button>
                  <button
                    onClick={() => setSnippetTab('node')}
                    className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${
                      snippetTab === 'node' ? 'bg-amber-300 text-black border border-black' : 'text-black/70'
                    }`}
                  >
                    Node.js
                  </button>
                  <button
                    onClick={() => setSnippetTab('curl')}
                    className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${
                      snippetTab === 'curl' ? 'bg-amber-300 text-black border border-black' : 'text-black/70'
                    }`}
                  >
                    cURL
                  </button>
                </div>
              </div>

              <div className="relative">
                <pre className="p-4 rounded-xl bg-black text-emerald-400 font-mono text-xs overflow-x-auto border-3 border-black shadow-[3px_3px_0px_0px_#000] leading-relaxed">
                  {snippetTab === 'python' && pythonCode}
                  {snippetTab === 'node' && nodeCode}
                  {snippetTab === 'curl' && curlCode}
                </pre>
                <button
                  onClick={() => {
                    const code = snippetTab === 'python' ? pythonCode : snippetTab === 'node' ? nodeCode : curlCode;
                    handleCopySnippet(code, snippetTab);
                  }}
                  className="absolute right-3 top-3 cartoon-btn px-3 py-1 bg-white hover:bg-amber-300 text-black text-[11px] font-black rounded-lg flex items-center space-x-1"
                >
                  {copiedSnippet === snippetTab ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSnippet === snippetTab ? 'Tersalin!' : 'Copy Code'}</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* System Settings & Security Section Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Card: Ganti Password Admin */}
          <section className="space-y-4">
            <h2 className="text-xl font-black font-heading text-black flex items-center gap-2">
              <Lock className="w-6 h-6 text-black" />
              <span>Ganti Password Admin</span>
            </h2>

            <form onSubmit={handleChangePassword} className="cartoon-box-yellow p-6 space-y-4">
              {passwordMsg && (
                <div className={`p-3 rounded-xl border-2 border-black font-bold text-xs flex items-center justify-between ${
                  passwordMsg.type === 'success' ? 'bg-emerald-300 text-black' : 'bg-rose-300 text-black'
                }`}>
                  <span>{passwordMsg.text}</span>
                  <button type="button" onClick={() => setPasswordMsg(null)} className="text-xs underline font-bold">✕</button>
                </div>
              )}

              <div>
                <label className="text-xs font-black text-black block mb-1">Password Lama</label>
                <input
                  type="password"
                  required
                  placeholder="Masukkan password saat ini"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl bg-white border-2 border-black text-sm font-bold text-black focus:outline-none shadow-[2px_2px_0px_0px_#000]"
                />
              </div>

              <div>
                <label className="text-xs font-black text-black block mb-1">Password Baru (Min. 8 Karakter)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="Masukkan password baru"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl bg-white border-2 border-black text-sm font-bold text-black focus:outline-none shadow-[2px_2px_0px_0px_#000]"
                />
              </div>

              <div>
                <label className="text-xs font-black text-black block mb-1">Konfirmasi Password Baru</label>
                <input
                  type="password"
                  required
                  placeholder="Ulangi password baru"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl bg-white border-2 border-black text-sm font-bold text-black focus:outline-none shadow-[2px_2px_0px_0px_#000]"
                />
              </div>

              <div className="flex items-center justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingPassword}
                  className="cartoon-btn px-6 py-2.5 rounded-xl bg-purple-300 hover:bg-purple-400 text-black font-black text-xs"
                >
                  {savingPassword ? 'Memperbarui...' : 'Simpan Password Baru'}
                </button>
              </div>
            </form>
          </section>

          {/* Card: System Settings */}
          <section className="space-y-4">
            <h2 className="text-xl font-black font-heading text-black flex items-center gap-2">
              <Settings className="w-6 h-6 text-black" />
              <span>Pengaturan Temp Mail</span>
            </h2>

            <form onSubmit={handleSaveSettings} className="cartoon-box-cyan p-6 space-y-4">
              <div>
                <label className="text-xs font-black text-black block mb-1">
                  Masa Hangus Mailbox (Menit) - <span className="bg-amber-200 px-1 rounded border border-black font-bold">10080 menit = 1 Minggu (7 Hari)</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={525600}
                  value={ttlMinutes}
                  onChange={(e) => setTtlMinutes(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl bg-white border-2 border-black text-sm font-black text-black focus:outline-none shadow-[2px_2px_0px_0px_#000]"
                />
              </div>

              <div>
                <label className="text-xs font-black text-black block mb-1">
                  Batas Pembuatan Email per Jam (per IP publik)
                </label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={creationLimit}
                  onChange={(e) => setCreationLimit(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl bg-white border-2 border-black text-sm font-black text-black focus:outline-none shadow-[2px_2px_0px_0px_#000]"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                {savedSettingsSuccess && (
                  <span className="text-xs text-black bg-emerald-300 border border-black px-2 py-1 rounded font-black flex items-center gap-1">
                    <Check className="w-4 h-4" /> Pengaturan Tersimpan!
                  </span>
                )}
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="cartoon-btn ml-auto px-6 py-2.5 rounded-xl bg-purple-300 hover:bg-purple-400 text-black font-black text-xs"
                >
                  {savingSettings ? 'Menyimpan...' : 'Simpan Pengaturan'}
                </button>
              </div>
            </form>
          </section>

        </div>

        {/* Maintenance & Audit Logs Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Card: Maintenance & Cleaners */}
          <section className="space-y-4">
            <h2 className="text-xl font-black font-heading text-black flex items-center gap-2">
              <Wrench className="w-6 h-6 text-black" />
              <span>Pemeliharaan & Pembersihan Sistem</span>
            </h2>

            <div className="cartoon-box-green p-6 space-y-4">
              {maintenanceMsg && (
                <div className="p-3 rounded-xl bg-white border-2 border-black font-bold text-xs text-black flex items-center justify-between">
                  <span>{maintenanceMsg}</span>
                  <button type="button" onClick={() => setMaintenanceMsg('')} className="underline">✕</button>
                </div>
              )}

              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-white border-2 border-black flex items-center justify-between gap-4 shadow-[2px_2px_0px_0px_#000]">
                  <div>
                    <h4 className="text-xs font-black text-black">Bersihkan Mailbox Kedaluwarsa</h4>
                    <p className="text-[11px] font-semibold text-black/70">
                      Hapus mailbox yang masa aktifnya sudah habis untuk menghemat database.
                    </p>
                  </div>
                  <button
                    onClick={handlePurgeExpired}
                    disabled={purging}
                    className="cartoon-btn px-4 py-2 rounded-xl bg-amber-300 hover:bg-amber-400 text-black text-xs font-black shrink-0"
                  >
                    {purging ? 'Membersihkan...' : 'Bersihkan'}
                  </button>
                </div>

                <div className="p-3.5 rounded-xl bg-white border-2 border-black flex items-center justify-between gap-4 shadow-[2px_2px_0px_0px_#000]">
                  <div>
                    <h4 className="text-xs font-black text-black">Hapus Riwayat System Log</h4>
                    <p className="text-[11px] font-semibold text-black/70">
                      Kosongkan catatan aktivitas dan log audit sistem terdahulu.
                    </p>
                  </div>
                  <button
                    onClick={handleClearLogs}
                    disabled={clearingLogs}
                    className="cartoon-btn px-4 py-2 rounded-xl bg-rose-300 hover:bg-rose-400 text-black text-xs font-black shrink-0"
                  >
                    {clearingLogs ? 'Menghapus...' : 'Hapus Log'}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Card: Activity Logs */}
          <section className="space-y-4">
            <h2 className="text-xl font-black font-heading text-black flex items-center gap-2">
              <Activity className="w-6 h-6 text-black" />
              <span>Log Aktivitas Sistem</span>
            </h2>

            <div className="cartoon-box p-4 max-h-[340px] overflow-y-auto space-y-3 font-mono text-xs">
              {stats?.recentLogs.length === 0 ? (
                <p className="text-black font-bold text-center py-6">Belum ada log aktivitas.</p>
              ) : (
                stats?.recentLogs.map((log) => {
                  let parsedMeta: any = null;
                  try {
                    if (log.metadata) parsedMeta = JSON.parse(log.metadata);
                  } catch {
                    parsedMeta = null;
                  }

                  return (
                    <div key={log.id} className="p-3 rounded-xl bg-amber-50 border-2 border-black space-y-1.5 shadow-[2px_2px_0px_0px_#000]">
                      <div className="flex items-center justify-between text-black font-black">
                        <span className="bg-purple-200 px-1.5 py-0.5 rounded border border-black text-[11px]">
                          [{log.action}]
                        </span>
                        <span className="text-[10px] text-black/80 font-bold">
                          {new Date(log.createdAt).toLocaleString()}
                        </span>
                      </div>
                      
                      {parsedMeta ? (
                        <div className="space-y-1 text-[11px] text-black">
                          {parsedMeta.otp && (
                            <div className="inline-flex items-center gap-1.5 bg-amber-300 border border-black px-2 py-0.5 rounded font-black text-black my-0.5">
                              <span>🔑 OTP:</span>
                              <span className="font-mono bg-white px-1 rounded border border-black tracking-wider">{parsedMeta.otp}</span>
                            </div>
                          )}
                          <p className="truncate font-semibold text-black/90">
                            {parsedMeta.recipient && <span>To: <strong>{parsedMeta.recipient}</strong> </span>}
                            {parsedMeta.subject && <span>| Subj: <em>{parsedMeta.subject}</em></span>}
                            {parsedMeta.sender && <span>| From: {parsedMeta.sender}</span>}
                            {parsedMeta.address && <span>Addr: <strong>{parsedMeta.address}</strong></span>}
                            {parsedMeta.email && <span>User: <strong>{parsedMeta.email}</strong></span>}
                            {parsedMeta.count !== undefined && <span>Count: <strong>{parsedMeta.count}</strong></span>}
                          </p>
                        </div>
                      ) : log.metadata ? (
                        <p className="text-black font-semibold text-[11px] truncate">{log.metadata}</p>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
