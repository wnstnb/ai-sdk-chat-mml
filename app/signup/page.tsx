'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '../../lib/supabase/client';

// Constants for Stripe Price IDs (easily swappable)
const STRIPE_PRICE_IDS = {
  monthly: 'price_1RR50wP5ZTVXN3kSg2UPq3OS', // Product ID: prod_SLmaopjPKETPQ2
  annual: 'price_1RR50CP5ZTVXN3kS4WaKvfQ6',  // Product ID: prod_SLmZG8yBgYEBqV
};

// It's best practice to load Stripe.js outside of a component's render to avoid
// recreating the Stripe object on every render.
// Your publishable key should be stored in an environment variable.
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'STRIPE_PUBLISHABLE_KEY');

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<'monthly' | 'annual' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stripe, setStripe] = useState<Stripe | null>(null);

  useEffect(() => {
    stripePromise.then((stripeInstance: Stripe | null) => {
      if (stripeInstance) {
        setStripe(stripeInstance);
      } else {
        console.error("Failed to initialize Stripe.");
        setError("Payment processing is currently unavailable. Please try again later.");
      }
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!selectedBillingCycle) {
      setError('Please select a billing cycle.');
      return;
    }
    if (!stripe) {
      setError('Payment system is not ready. Please wait a moment and try again.');
      return;
    }

    setLoading(true);

    try {
      // 1. Create user in your backend (Supabase)
      const userCreationResponse = await fetch('/api/auth/signup-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, billingCycle: selectedBillingCycle }),
      });

      const userData = await userCreationResponse.json();

      if (!userCreationResponse.ok) {
        throw new Error(userData.error || 'Failed to create user.');
      }
      
      const userId = userData.userId; // Get userId from the backend response
      const userEmail = userData.email; // Get email from the backend response (could also use state 'email')

      // 2. Create a Stripe Checkout session by calling your backend
      const priceId = STRIPE_PRICE_IDS[selectedBillingCycle];
      
      const checkoutSessionResponse = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, email: userEmail, userId }),
      });

      const sessionData = await checkoutSessionResponse.json();

      if (!checkoutSessionResponse.ok) {
        throw new Error(sessionData.error || 'Failed to create checkout session.');
      }

      // 3. Redirect to Stripe Checkout
      const { error: stripeError } = await stripe.redirectToCheckout({
        sessionId: sessionData.sessionId,
      });

      if (stripeError) {
        console.error('Stripe redirect error:', stripeError);
        setError(stripeError.message || 'Failed to redirect to payment.');
        // Potentially, you might want to inform the user to try again or contact support.
        // If redirect fails, the user is still on your page.
      }
      // If redirectToCheckout is successful, the user will be navigated away from this page.
      // No need to setLoading(false) here if redirect is expected to happen.

    } catch (err: any) {
      console.error('Signup process error:', err);
      setError(err.message || 'An unexpected error occurred during signup.');
      setLoading(false); // Ensure loading is turned off on caught error
    }
    // setLoading(false) might not be reached if redirectToCheckout is successful, which is fine.
    // If an error occurs before redirect, or redirect itself fails, then it will be set to false in catch.
  };

  const billingOptions = {
    monthly: { id: 'monthly', name: 'Monthly', price: '$16', period: 'per month', savingsText: null },
    annual: { id: 'annual', name: 'Annual', price: '$160', period: 'per year', savingsText: '(Save 20%)' }, 
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-[url('/tuon-bg.png')] bg-cover bg-center p-4">
      <div className="w-full max-w-md bg-[color:var(--card-bg)]/70 backdrop-blur-lg rounded-xl shadow-2xl border border-[color:var(--border-color)]/25 p-6 md:p-8">
        <div className="flex flex-col items-center mb-6">
          <Link href="/" className="flex items-center">
            <img src="/tuon-logo-svg-type.svg" alt="Tuon Logo" className="h-10 w-10 mr-2" style={{ filter: 'var(--logo-filter)' }} />
            {/* <span className="text-3xl font-bold text-[color:var(--accent-color)] font-newsreader">tuon.io</span> */}
          </Link>
          <p className="text-sm text-[color:var(--primary-color)]/70 mt-1">Bring it all into focus.</p>
        </div>

        <h1 className="text-2xl font-semibold text-center text-[color:var(--accent-color)] mb-4 font-newsreader">
          Create Your Account
        </h1>
        <p className="text-center text-[color:var(--primary-color)]/80 mb-6 text-sm">
          Try all features for free with your 7-day trial. <br /><b>Cancel or upgrade anytime</b>.
        </p>

        {/* Social Logins First */}
        <div className="mb-6">
          <Auth
            supabaseClient={supabase}
            appearance={{ theme: ThemeSupa }}
            providers={['google', 'github']}
            socialLayout="horizontal"
            onlyThirdPartyProviders={true}
            view="sign_up"
            redirectTo={`${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback?next=/launch`}
          />
        </div>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-[color:var(--border-color)]/30"></span>
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-[color:var(--card-bg)] px-2 text-[color:var(--muted-text-color)]">Or sign up with email</span>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[color:var(--text-color-secondary)] mb-1">Email address</label>
            <input
              id="email"
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
            <label htmlFor="password" className="block text-sm font-medium text-[color:var(--text-color-secondary)] mb-1">Password</label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                minLength={6}
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

          <div>
            <label htmlFor="confirm-password" className="block text-sm font-medium text-[color:var(--text-color-secondary)] mb-1">Confirm Password</label>
            <div className="relative">
              <input
                id="confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                required
                disabled={loading}
                className="auth-input w-full px-3 py-2 rounded-md border border-[color:var(--input-border-color)] bg-[color:var(--input-bg-color)] text-[color:var(--text-color)] placeholder-[color:var(--input-placeholder-color)] focus:outline-none focus:ring-1 focus:ring-[#C79553] focus:border-[#C79553]"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-[color:var(--muted-text-color)] hover:text-[color:var(--text-color)]"
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Billing Cycle Selection Section */}
          <div className="pt-2 space-y-3">
            <label className="block text-sm font-medium text-[color:var(--text-color-secondary)] mb-2">Choose your plan</label>
            <div className="space-y-3">
              {(Object.values(billingOptions) as Array<typeof billingOptions.monthly | typeof billingOptions.annual>)
                .map(option => (
                <div
                  key={option.id}
                  onClick={() => setSelectedBillingCycle(option.id as 'monthly' | 'annual')}
                  className={`cursor-pointer p-4 rounded-lg border-2 transform transition-all duration-300 ease-in-out 
                            bg-[#0F1317] hover:border-[color:var(--brand-color-accent)]
                            ${selectedBillingCycle === option.id 
                              ? 'border-[#C79553] opacity-100 scale-100' 
                              : 'border-[color:var(--input-border-color)] opacity-60 scale-95 hover:opacity-100 hover:scale-100'}`}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-baseline">
                      <h3 className="font-semibold text-md text-[color:var(--text-color)] mr-2">{option.name}</h3>
                      {option.savingsText && 
                        <span className="text-xs text-green-500 font-medium">{option.savingsText}</span>
                      }
                    </div>
                    {selectedBillingCycle === option.id && 
                      <CheckCircle2 size={24} className="text-[#C79553] flex-shrink-0" />
                    }
                  </div>
                  <p className="text-xl font-bold text-[color:var(--accent-color)] mt-1">{option.price} <span className="text-sm font-normal text-[color:var(--muted-text-color)]">{option.period}</span></p>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-500 text-center pt-1">{error}</p>}

          <div className="pt-2">
            <button 
              type="submit" 
              className="w-full justify-center text-sm py-3 px-4 rounded-md font-medium 
                         bg-[color:var(--primary-color)] text-[color:var(--bg-color)] 
                         hover:bg-[color:var(--accent-color)] 
                         focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#C79553]"
              disabled={loading || !selectedBillingCycle}
            >
              {loading ? 'Processing...' : 'Start Free 7-Day Trial'}
            </button>
          </div>
        </form>

        <div className="text-center text-sm mt-8">
          <Link href="/login" className="font-medium text-[color:var(--anchor-text-color)] hover:text-[color:var(--anchor-text-hover-color)] hover:underline">
            Already have an account? Login
          </Link>
        </div>
      </div>
    </div>
  );
} 