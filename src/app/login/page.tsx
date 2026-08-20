// src/app/login/page.tsx
'use client';

import { useState, Suspense } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSearchParams, useRouter } from 'next/navigation';
import { Mail, Lock, CheckCircle } from 'lucide-react';

function isSafeRedirect(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//') && !path.includes(':');
}

function LoginForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');
  const supabase = createClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const next = searchParams.get('next') || '/board';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setEmailSent(true);
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setLoading(true);
    setOtpError('');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setLoading(false);
    if (error) setOtpError(error.message);
  };

  const handleVerifyOtp = async () => {
    const code = otpCode.trim();
    if (!code) return;
    setOtpLoading(true);
    setOtpError('');
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code,
      type: 'email',
    });
    if (error) {
      setOtpError(error.message);
      setOtpLoading(false);
    } else {
      router.push(isSafeRedirect(next) ? next : '/board');
    }
  };

  if (emailSent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sound-50 via-white to-cyan-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">

          {/* Confirmation */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-forest-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-forest-500" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Check Your Email</h2>
            <p className="text-slate-600 mb-4">
              We sent a link to <strong>{email}</strong>. Click it to sign in.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                The link expires in 1 hour. If you don't see it, check spam or use the
                code below. If your email isn't recognized, contact TECH to have it added.
              </p>
            </div>
          </div>

          {/* OTP fallback */}
          <div className="border-t border-slate-200 pt-6">
            <p className="text-sm font-medium text-slate-700 mb-3">
              Having trouble with the link? Enter the 6-digit code from your email.
            </p>
            <div className="space-y-3">
              <div>
                <label htmlFor="otp-code" className="block text-sm font-medium text-slate-700 mb-2">
                  6-digit code
                </label>
                <input
                  id="otp-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoComplete="one-time-code"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleVerifyOtp(); }}
                  placeholder="123456"
                  disabled={otpLoading}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg text-center text-xl tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-sound-500 focus:border-transparent"
                />
              </div>
              {otpError && (
                <div role="alert" className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-800">{otpError}</p>
                </div>
              )}
              <button
                onClick={handleVerifyOtp}
                disabled={otpLoading || !otpCode.trim()}
                className="w-full bg-sound-500 text-white font-semibold py-3 rounded-lg hover:bg-sound-600 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
              >
                {otpLoading ? 'Verifying...' : 'Verify Code'}
              </button>
            </div>
          </div>

          {/* Footer actions */}
          <div className="mt-6 flex flex-col items-center gap-2">
            <button
              onClick={handleResend}
              disabled={loading}
              className="text-sound-500 hover:text-sound-600 text-sm font-medium disabled:text-slate-400"
            >
              {loading ? 'Sending...' : 'Resend email'}
            </button>
            <button
              onClick={() => { setEmailSent(false); setEmail(''); setOtpCode(''); setOtpError(''); }}
              className="text-slate-500 hover:text-slate-700 text-sm"
            >
              Use a different email
            </button>
          </div>

        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sound-50 via-white to-cyan-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-sound-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="h-8 w-8 text-sound-500" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Selection Board</h1>
          <p className="text-slate-600">Sign in to access the candidate selection system</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@example.com"
                required
                className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sound-500 focus:border-transparent"
                disabled={loading}
              />
            </div>
          </div>

          {error && (
            <div role="alert" className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-sound-500 text-white font-semibold py-3 rounded-lg hover:bg-sound-600 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            {loading ? 'Sending...' : 'Send Magic Link'}
          </button>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <p className="text-xs text-slate-600 text-center">
              🔒 Secure passwordless login. We'll send you an email with a link to sign in.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
