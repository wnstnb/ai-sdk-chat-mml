'use client';

import React, { useState } from 'react';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '../lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';

interface AuthUIProps {
  providers?: ('google' | 'github' | 'azure' | 'bitbucket' | 'gitlab' | 'apple' | 'discord' | 'facebook' | 'keycloak' | 'linkedin' | 'notion' | 'slack' | 'spotify' | 'twitch' | 'twitter' | 'workos')[];
  view?: 'sign_in' | 'sign_up' | 'forgotten_password' | 'update_password' | 'magic_link';
  socialLayout?: 'horizontal' | 'vertical';
  onlyThirdPartyProviders?: boolean;
}

export default function AuthUI({ 
  providers = ['google'],
  socialLayout = 'horizontal',
}: AuthUIProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'standard' | 'otp'>('standard');
  const router = useRouter();
  
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const { error: signInError, data } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(signInError.message);
      } else {
        setMessage('Sign in successful! Redirecting...');
        console.log('Authentication successful via Password with user:', data.session?.user?.id);
        router.replace('/launch');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to sign in. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    
    setLoading(true);
    setError('');
    setMessage('');
    
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
        }
      });
      
      if (error) {
        setError(error.message);
      } else {
        setOtpSent(true);
        setMessage('One-time password sent to your email');
      }
    } catch (err) {
      setError('Failed to send OTP. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !otp) return;
    
    setLoading(true);
    setError('');
    setMessage('');
    
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'email',
      });
      
      if (error) {
        setError(error.message);
      } else {
        setMessage('Login successful! Redirecting...');
        
        console.log('Authentication successful via OTP with user:', data.session?.user?.id);
        
        setTimeout(() => {
          console.log('Manually redirecting to /launch after successful OTP login');
          router.replace('/launch');
        }, 500);
      }
    } catch (err) {
      setError('Failed to verify OTP. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  
  const handleBackToEmail = () => {
    setOtpSent(false);
    setOtp('');
  };
  
  const switchTab = (tab: 'standard' | 'otp') => {
    setActiveTab(tab);
    setMessage('');
    setError('');
    setOtp('');
    setOtpSent(false);
  };

  return (
    <div className="auth-ui-container space-y-6">
      <div className="social-providers-section mb-6">
        <Auth
          supabaseClient={supabase}
          appearance={{ theme: ThemeSupa }}
          providers={providers}
          socialLayout={socialLayout}
          onlyThirdPartyProviders={true}
          redirectTo={`${origin}/auth/callback?next=/launch`}
        />
      </div>
      
      {providers && providers.length > 0 && (activeTab === 'standard' || activeTab === 'otp') && (
        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-[color:var(--border-color)]/30"></span>
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-[color:var(--card-bg)] px-2 text-[color:var(--muted-text-color)]">
              Or sign in with
            </span>
          </div>
        </div>
      )}

      <div className="flex border-b border-[color:var(--border-color)]/30 mb-8 justify-center">
        <button 
          className={`py-3 px-4 sm:px-5 font-medium text-xs sm:text-sm md:text-base focus:outline-none transition-all duration-300 ease-in-out relative group
                      ${
                        activeTab === 'standard' 
                        ? 'text-[color:var(--accent-color)]' 
                        : 'text-[color:var(--muted-text-color)] hover:text-[color:var(--primary-color)]'
                      }`}
          onClick={() => switchTab('standard')}
          type="button"
        >
          Password Login
          <span className={`absolute bottom-[-1px] left-0 w-full h-0.5 bg-[color:var(--accent-color)] transform transition-transform duration-300 ease-out
                      ${activeTab === 'standard' ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'}`}></span>
        </button>
        <button 
          className={`py-3 px-4 sm:px-5 font-medium text-xs sm:text-sm md:text-base focus:outline-none transition-all duration-300 ease-in-out relative group
                      ${
                        activeTab === 'otp' 
                        ? 'text-[color:var(--accent-color)]' 
                        : 'text-[color:var(--muted-text-color)] hover:text-[color:var(--primary-color)]'
                      }`}
          onClick={() => switchTab('otp')}
          type="button"
        >
          OTP Login
          <span className={`absolute bottom-[-1px] left-0 w-full h-0.5 bg-[color:var(--accent-color)] transform transition-transform duration-300 ease-out
                      ${activeTab === 'otp' ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'}`}></span>
        </button>
      </div>
      
      <div className="auth-content mt-4">
        {activeTab === 'otp' ? (
          <div className="otp-section space-y-4">
            {message && <div className={`text-sm ${error ? 'text-red-400' : 'text-green-400'}`}>{message}</div>}
            {error && !message && <div className="text-sm text-red-400">{error}</div>}
            
            {!otpSent ? (
              <form onSubmit={handleSendOTP} className="space-y-4">
                <div>
                  <label htmlFor="email-otp" className="block text-sm font-medium text-[--text-color-secondary] mb-1">Email</label>
                  <input
                    id="email-otp"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your.email@example.com"
                    required
                    disabled={loading}
                    className="auth-input w-full px-3 py-2 rounded-md border border-[--input-border-color] bg-[--input-bg-color] text-[--text-color] placeholder-[--input-placeholder-color] focus:outline-none focus:ring-1 focus:ring-[#C79553] focus:border-[#C79553]"
                  />
                </div>
                <button 
                  type="submit" 
                  className="auth-button w-full justify-center text-sm bg-[color:var(--primary-color)] text-[color:var(--bg-color)] hover:bg-[color:var(--accent-color)] py-2.5 rounded-md"
                  disabled={loading}
                >
                  {loading ? 'Sending...' : 'Send One-Time Password'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOTP} className="space-y-4">
                <div>
                  <label htmlFor="otp-code" className="block text-sm font-medium text-[--text-color-secondary] mb-1">Enter the code from your email</label>
                  <input
                    id="otp-code"
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="123456"
                    required
                    disabled={loading}
                    className="auth-input w-full px-3 py-2 rounded-md border border-[--input-border-color] bg-[--input-bg-color] text-[--text-color] placeholder-[--input-placeholder-color] focus:outline-none focus:ring-1 focus:ring-[#C79553] focus:border-[#C79553]"
                  />
                </div>
                <button 
                  type="submit" 
                  className="auth-button w-full justify-center text-sm bg-[color:var(--primary-color)] text-[color:var(--bg-color)] hover:bg-[color:var(--accent-color)] py-2.5 rounded-md"
                  disabled={loading}
                >
                  {loading ? 'Verifying...' : 'Verify Code'}
                </button>
                <button 
                  type="button" 
                  className="text-sm text-[--text-color-secondary] hover:text-[--brand-color] focus:outline-none w-full text-center mt-2"
                  onClick={handleBackToEmail}
                  disabled={loading}
                >
                  Use a different email
                </button>
              </form>
            )}
          </div>
        ) : (
          <form onSubmit={handlePasswordSignIn} className="space-y-4">
            {message && <div className={`text-sm ${error ? 'text-red-400' : 'text-green-400'}`}>{message}</div>}
            {error && !message && <div className="text-sm text-red-400">{error}</div>}
            
            <div>
              <label htmlFor="email-standard" className="block text-sm font-medium text-[color:var(--text-color-secondary)] mb-1">Email address</label>
              <input
                id="email-standard"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@example.com"
                required
                disabled={loading}
                className="auth-input w-full px-3 py-2 rounded-md border border-[color:var(--input-border-color)] bg-[color:var(--input-bg-color)] text-[color:var(--text-color)] placeholder-[color:var(--input-placeholder-color)] focus:outline-none focus:ring-1 focus:ring-[#C79553] focus:border-[#C79553]"
              />
            </div>
            <div>
              <label htmlFor="password-standard" className="block text-sm font-medium text-[color:var(--text-color-secondary)] mb-1">Password</label>
              <div className="relative">
                <input
                  id="password-standard"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  required
                  disabled={loading}
                  className="auth-input w-full px-3 py-2 rounded-md border border-[color:var(--input-border-color)] bg-[color:var(--input-bg-color)] text-[color:var(--text-color)] placeholder-[color:var(--input-placeholder-color)] focus:outline-none focus:ring-1 focus:ring-[#C79553] focus:border-[#C79553]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-[color:var(--muted-text-color)] hover:text-[color:var(--text-color)]"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div className="text-right text-sm">
              <button 
                type="button"
                onClick={() => {
                  setError('');
                  setMessage('Forgot password functionality is not yet implemented. Please contact support if you need to reset your password.');
                }}
                className="font-medium text-[color:var(--anchor-text-color)] hover:text-[color:var(--anchor-text-hover-color)] hover:underline focus:outline-none"
              >
                Forgot your password?
              </button>
            </div>
            <button 
              type="submit" 
              className="auth-button w-full justify-center text-sm bg-[color:var(--primary-color)] text-[color:var(--bg-color)] hover:bg-[color:var(--accent-color)] py-2.5 rounded-md"
              disabled={loading || !email || !password}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
} 