'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Globe, Mail, Shield, Server, RefreshCw, Plus, Trash2, 
  LogOut, Settings, Activity, Check, ArrowLeft 
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

export default function AdminDashboardPage() {
  const router = useRouter();

  const [stats, setStats] = useState<StatsData | null>(null);
  const [domains, setDomains] = useState<DomainItem[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
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

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, domainsRes, settingsRes] = await Promise.all([
        fetch('/api/admin/stats'),
        fetch('/api/admin/domains'),
        fetch('/api/admin/settings'),
      ]);

      if (statsRes.status === 401 || domainsRes.status === 401) {
        router.push('/admin/login');
        return;
      }

      const statsData = await statsRes.json();
      const domainsData = await domainsRes.json();
      const settingsData = await settingsRes.json();

      setStats(statsData);
      setDomains(domainsData.domains || []);
      setSettings(settingsData.settings || {});

      if (settingsData.settings?.mailbox_lifetime_minutes) {
        setTtlMinutes(settingsData.settings.mailbox_lifetime_minutes);
      } else {
        setTtlMinutes('10080');
      }
      if (settingsData.settings?.creation_limit_per_hour) {
        setCreationLimit(settingsData.settings.creation_limit_per_hour);
      }
    } catch (err: any) {
      console.error(err);
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
              className="p-2 rounded-xl bg-white border-2 border-black text-black font-black hover:bg-gray-100"
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
            <p className="text-xs font-bold text-black/80">Inbound terproses</p>
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
              <span className="text-xs font-black">System Audit Logs</span>
              <Activity className="w-5 h-5 text-black" />
            </div>
            <p className="text-3xl font-black text-black">{stats?.recentLogs.length || 0}</p>
            <p className="text-xs font-bold text-black/80">Aktivitas tercatat</p>
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
              placeholder="MX Target (default: in1-smtp.messagingengine.com)"
              value={newMxTarget}
              onChange={(e) => setNewMxTarget(e.target.value)}
              className="flex-1 h-11 px-4 rounded-xl bg-white border-2 border-black text-sm font-bold text-black focus:outline-none shadow-[2px_2px_0px_0px_#000]"
            />
            <button
              type="submit"
              disabled={addingDomain}
              className="cartoon-btn h-11 px-6 rounded-xl bg-purple-300 hover:bg-purple-400 text-black text-xs font-black flex items-center justify-center space-x-1.5 shrink-0"
            >
              {addingDomain ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              <span>Tambah & Verifikasi</span>
            </button>
          </form>

          {/* Domains Table */}
          <div className="cartoon-box overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-amber-200 border-b-3 border-black text-black text-xs uppercase font-black">
                  <tr>
                    <th className="p-4">Domain Name</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Verification</th>
                    <th className="p-4">Mailboxes</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-black bg-white">
                  {domains.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center font-bold text-black">
                        Belum ada domain yang didaftarkan. Tambah domain baru di atas!
                      </td>
                    </tr>
                  ) : (
                    domains.map((dom) => (
                      <tr key={dom.id} className="hover:bg-amber-50 transition-colors">
                        <td className="p-4 font-mono font-black text-black text-base">@{dom.domain}</td>
                        <td className="p-4">
                          <button
                            onClick={() => handleToggleDomainStatus(dom.id, dom.status)}
                            className={`px-3 py-1 rounded-lg text-xs font-black border-2 border-black shadow-[2px_2px_0px_0px_#000] ${
                              dom.status === 'ACTIVE'
                                ? 'bg-emerald-300 text-black'
                                : 'bg-gray-200 text-black'
                            }`}
                          >
                            {dom.status}
                          </button>
                        </td>
                        <td className="p-4 text-xs font-bold text-black">
                          {dom.verificationStatus}
                        </td>
                        <td className="p-4 font-mono font-black text-black">{dom._count?.mailboxes || 0}</td>
                        <td className="p-4 text-right space-x-2">
                          <button
                            onClick={() => handleVerifyDomain(dom.id)}
                            className="cartoon-btn px-3 py-1.5 rounded-lg bg-cyan-200 hover:bg-cyan-300 text-xs font-black text-black"
                          >
                            Verify DNS
                          </button>
                          <button
                            onClick={() => handleDeleteDomain(dom.id)}
                            className="cartoon-btn p-2 rounded-lg bg-rose-300 hover:bg-rose-400 text-black"
                            title="Hapus domain"
                          >
                            <Trash2 className="w-4 h-4" />
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

        {/* System Settings & Logs Section Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* System Settings */}
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
                  Batas Pembuatan Email per Jam (per IP)
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

          {/* Activity Logs */}
          <section className="space-y-4">
            <h2 className="text-xl font-black font-heading text-black flex items-center gap-2">
              <Activity className="w-6 h-6 text-black" />
              <span>Log Aktivitas Sistem</span>
            </h2>

            <div className="cartoon-box p-4 max-h-[360px] overflow-y-auto space-y-3 font-mono text-xs">
              {stats?.recentLogs.length === 0 ? (
                <p className="text-black font-bold text-center py-6">Belum ada log aktivitas.</p>
              ) : (
                stats?.recentLogs.map((log) => (
                  <div key={log.id} className="p-3 rounded-xl bg-amber-50 border-2 border-black space-y-1">
                    <div className="flex items-center justify-between text-black font-black">
                      <span>[{log.action}]</span>
                      <span className="text-[10px] text-black/80">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {log.metadata && (
                      <p className="text-black font-semibold text-[11px] truncate">{log.metadata}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
