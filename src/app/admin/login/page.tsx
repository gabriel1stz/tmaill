'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Mail, ShieldAlert, ArrowRight, RefreshCw } from 'lucide-react';
import Link from 'next/link';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Login gagal. Periksa kembali email & password.');
      }

      router.push('/admin/dashboard');
    } catch (err: any) {
      setError(err.message || 'Authentication error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#f7f4ee] font-sans text-black">
      <div className="cartoon-box-yellow w-full max-w-md p-8 space-y-8 shadow-[8px_8px_0px_0px_#18181b]">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-purple-300 border-3 border-black flex items-center justify-center mx-auto shadow-[3px_3px_0px_0px_#18181b]">
            <Lock className="w-7 h-7 text-black" />
          </div>
          <h1 className="text-2xl font-black font-heading text-black">Admin Control Center</h1>
          <p className="text-xs font-bold text-black/80">Masuk untuk mengelola domain & setting tmail riellpedia</p>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-rose-200 border-3 border-black text-black text-xs font-bold flex items-center space-x-2 shadow-[2px_2px_0px_0px_#18181b]">
            <ShieldAlert className="w-5 h-5 shrink-0 text-black" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-xs font-black text-black block mb-1.5">Admin Email</label>
            <div className="relative">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="riell@pedia.com"
                className="w-full h-12 pl-10 pr-4 rounded-xl bg-white border-3 border-black text-black text-sm font-bold focus:outline-none shadow-[2px_2px_0px_0px_#18181b]"
              />
              <Mail className="w-4 h-4 text-black absolute left-3.5 top-4" />
            </div>
          </div>

          <div>
            <label className="text-xs font-black text-black block mb-1.5">Password</label>
            <div className="relative">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full h-12 pl-10 pr-4 rounded-xl bg-white border-3 border-black text-black text-sm font-bold focus:outline-none shadow-[2px_2px_0px_0px_#18181b]"
              />
              <Lock className="w-4 h-4 text-black absolute left-3.5 top-4" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="cartoon-btn w-full h-12 rounded-xl bg-cyan-300 hover:bg-cyan-400 text-black font-black text-sm flex items-center justify-center space-x-2 shadow-[4px_4px_0px_0px_#18181b]"
          >
            {loading ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <span>Sign In ke Admin</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>

        <div className="text-center pt-2 border-t-2 border-black/20">
          <Link href="/" className="text-xs font-black text-black hover:underline">
            ← Kembali ke Homepage Temp Mail
          </Link>
        </div>
      </div>
    </div>
  );
}
