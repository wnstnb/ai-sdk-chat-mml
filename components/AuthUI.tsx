'use client';

import React, { useState } from 'react';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '../lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AuthUI() {
  const [email, setEmail] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'standard' | 'otp'>('standard');
  const router = useRouter();
  
  // Get the current origin for redirects
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

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
        
        // Log authentication success and cookies for debugging
        console.log('Authentication successful via OTP with user:', data.session?.user?.id);
        
        // Force a direct navigation instead of waiting for context
        setTimeout(() => {
          console.log('Manually redirecting to /launch after successful OTP login');
          router.replace('/launch');
        }, 500); // Short delay to allow state to update
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
            {message && <div className="text-sm text-green-400">{message}</div>}
            {error && <div className="text-sm text-red-400">{error}</div>}
            
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
                  className="auth-button w-full justify-center"
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
                  className="auth-button w-full justify-center"
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
          <>
            <Auth
              supabaseClient={supabase}
              appearance={{
                theme: ThemeSupa,
                variables: {
                  default: {
                    colors: {
                      brand: 'var(--brand-color)',
                      brandAccent: 'var(--brand-color-accent)',
                      brandButtonText: 'var(--brand-button-text)',
                      inputBackground: 'var(--input-bg-color)',
                      inputBorder: 'var(--input-border-color)',
                      inputPlaceholder: 'var(--input-placeholder-color)',
                      messageText: 'var(--message-text-color)',
                      anchorTextColor: 'var(--anchor-text-color)',
                      anchorTextHoverColor: 'var(--anchor-text-hover-color)',
                    },
                    radii: {
                      borderRadiusButton: '4px',
                      buttonBorderRadius: '4px',
                      inputBorderRadius: '4px',
                    },
                  },
                  dark: {
                    colors: {
                      brand: 'var(--brand-color)',
                      brandAccent: 'var(--brand-color-accent)',
                      brandButtonText: 'var(--brand-button-text)',
                      defaultButtonBackground: 'var(--button-bg-color)',
                      defaultButtonBackgroundHover: 'var(--button-bg-hover-color)',
                      defaultButtonBorder: 'var(--button-border-color)',
                      defaultButtonText: 'var(--button-text-color)',
                      dividerBackground: 'var(--border-color)',
                      inputBackground: 'var(--input-bg-color)',
                      inputBorder: 'var(--input-border-color)',
                      inputBorderHover: 'var(--input-border-hover-color)',
                      inputBorderFocus: '#C79553',
                      inputText: 'var(--text-color)',
                      inputPlaceholder: 'var(--input-placeholder-color)',
                      messageText: 'var(--message-text-color)',
                      messageTextDanger: 'var(--message-text-danger-color)',
                      anchorTextColor: 'var(--anchor-text-color)',
                      anchorTextHoverColor: 'var(--anchor-text-hover-color)',
                    }
                  }
                },
                className: {
                  container: 'supabase-auth-container',
                  button: 'auth-button text-sm bg-[color:var(--primary-color)] text-[color:var(--bg-color)] hover:bg-[color:var(--accent-color)]',
                  input: 'auth-input focus:outline-none focus:ring-1 focus:ring-[#C79553] focus:border-[#C79553]',
                  label: 'auth-label',
                  anchor: 'auth-anchor',
                  message: 'auth-message',
                  divider: 'auth-divider'
                },
              }}
              theme="dark"
              providers={[]}
              redirectTo={`${origin}/launch`}
              view="sign_in"
              localization={{
                variables: {
                  sign_in: {
                    email_label: 'Email address',
                    password_label: 'Your Password',
                    button_label: "Sign in",
                  },
                  sign_up: {
                      link_text: ""
                  },
                  forgotten_password: {
                    link_text: 'Forgot your password?',
                  },
                }
              }}
            />
            <div className="text-center mt-4 text-sm">
              {/* <Link href="/signup" className="auth-anchor hover:underline text-[color:var(--anchor-text-color)] hover:text-[color:var(--anchor-text-hover-color)]">
                Don't have an account? Sign up
              </Link> */}
              <p className="auth-anchor text-[color:var(--anchor-text-color)] hover:text-[color:var(--anchor-text-hover-color)]">
                Sign up will be available soon!
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
} 