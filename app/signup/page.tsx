'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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

// Define a type for the socially authenticated user
interface SociallyAuthenticatedUser {
  email: string | undefined;
  id: string;
  provider: string | undefined;
}

// Helper function to get the site URL
const getURL = () => {
  let url =
    process?.env?.NEXT_PUBLIC_SITE_URL ?? // Set this to your site URL in production
    process?.env?.NEXT_PUBLIC_VERCEL_URL ?? // Automatically set by Vercel.
    'http://localhost:3000/';
  // Make sure to include `https://` when not localhost.
  url = url.includes('http') ? url : `https://${url}`;
  // Make sure to include a trailing '/'.
  url = url.charAt(url.length - 1) === '/' ? url : `${url}/`;
  return url;
};

// This new component will contain the logic and JSX that uses useSearchParams
function SignupFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<'monthly' | 'annual' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stripe, setStripe] = useState<Stripe | null>(null);
  const [sociallyAuthenticatedUser, setSociallyAuthenticatedUser] = useState<SociallyAuthenticatedUser | null>(null);
  const [socialAuthMessage, setSocialAuthMessage] = useState('');

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

  // useEffect for handling social_auth_pending and step=complete_plan_selection
  useEffect(() => {
    const socialAuthPending = searchParams.get('social_auth_pending');
    const completePlanSelectionStep = searchParams.get('step');

    const processAuthContinuation = async (messageType: 'social_auth' | 'complete_plan') => {
      setLoading(true);
      setError('');
      setSocialAuthMessage('');

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('Error getting session:', sessionError);
        setError('Could not verify your authentication. Please try again.');
        setLoading(false);
        router.replace('/signup', { scroll: false }); // Clear params
        return;
      }

      if (session && session.user) {
        const user = session.user;
        const provider = user.app_metadata?.provider; // May be undefined if not a social login
        const userEmail = user.email;

        setSociallyAuthenticatedUser({
          email: userEmail,
          id: user.id,
          provider: provider, // Will be undefined for email users completing profile, that's fine
        });
        
        if (messageType === 'social_auth') {
          let providerName = 'your social account';
          if (provider === 'google') providerName = 'Google';
          else if (provider === 'github') providerName = 'GitHub';
          setSocialAuthMessage(`Successfully authenticated via ${providerName} as ${userEmail}. Please choose your plan.`);
        } else { // complete_plan
          setSocialAuthMessage(`Welcome back, ${userEmail}! Please complete your signup by selecting a plan to start your trial.`);
        }
        
        // Clear the query params from URL
        router.replace('/signup', { scroll: false });
      } else {
        if (messageType === 'social_auth') {
          setError('Social authentication was initiated but could not be completed. Please try again.');
        } else { // complete_plan
          setError('Could not verify your session to complete plan selection. Please log in again.');
          // Optionally redirect to login if session is expected but not found
          // router.replace('/login'); 
        }
        router.replace('/signup', { scroll: false }); // Clear params
      }
      setLoading(false);
    };

    if (socialAuthPending === 'true') {
      processAuthContinuation('social_auth');
    } else if (completePlanSelectionStep === 'complete_plan_selection') {
      processAuthContinuation('complete_plan');
    }
  }, [searchParams, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Common validations for both flows
    if (!selectedBillingCycle) {
      setError('Please select a billing cycle.');
      return;
    }
    if (!stripe) {
      setError('Payment system is not ready. Please wait a moment and try again.');
      return;
    }

    // Email/Password specific validation (only if not socially authenticated)
    if (!sociallyAuthenticatedUser && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      let sessionId: string | null = null;

      if (sociallyAuthenticatedUser) {
        // -------- Socially Authenticated Flow --------
        // User is already authenticated via Supabase (Google/GitHub)
        // We just need to update their profile with billing cycle and create Stripe session.
        
        const response = await fetch('/api/auth/complete-social-signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            billingCycle: selectedBillingCycle 
          }),
        });

        const sessionData = await response.json();
        if (!response.ok) {
          throw new Error(sessionData.error || 'Failed to complete social signup process.');
        }
        sessionId = sessionData.sessionId;

      } else {
        // -------- Email/Password Signup Flow --------
        // 1. Create user in Supabase (this also updates profile with billing cycle via API logic)
        const userCreationResponse = await fetch('/api/auth/signup-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, billingCycle: selectedBillingCycle }),
        });

        const userData = await userCreationResponse.json();
        if (!userCreationResponse.ok) {
          throw new Error(userData.error || 'Failed to create user.');
        }
        
        const userId = userData.userId; 
        const userEmail = userData.email; 

        // 2. Create a Stripe Checkout session for the new email/password user
        const priceId = STRIPE_PRICE_IDS[selectedBillingCycle];
        
        const checkoutSessionResponse = await fetch('/api/stripe/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priceId, email: userEmail, userId }),
        });

        const stripeSessionData = await checkoutSessionResponse.json();
        if (!checkoutSessionResponse.ok) {
          throw new Error(stripeSessionData.error || 'Failed to create checkout session.');
        }
        sessionId = stripeSessionData.sessionId;
      }

      // -------- Common: Redirect to Stripe Checkout --------
      if (!sessionId) {
        throw new Error('Could not retrieve Stripe session ID.');
      }

      const { error: stripeError } = await stripe.redirectToCheckout({
        sessionId: sessionId,
      });

      if (stripeError) {
        console.error('Stripe redirect error:', stripeError);
        setError(stripeError.message || 'Failed to redirect to payment. Please try again.');
        // Button should remain active for retry - setLoading(false) is in catch block
      }
      // If redirectToCheckout is successful, user is navigated away.

    } catch (err: any) {
      console.error('Signup process error:', err);
      let displayError = err.message || 'An unexpected error occurred during signup. Please try again.';
      if (err.message && err.message.includes('Failed to connect to our payment system')) {
        // More specific error if it was a Stripe redirect fail as per PRD
        displayError = "We couldn't connect to our payment system to start your trial. Please try again.";
      }
      setError(displayError);
    } finally {
      setLoading(false); // Ensure loading is turned off in all cases (success redirect or error)
    }
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
          <p className="text-sm text-[color:var(--primary-color)]/70 mt-1">Bring it all into focus</p>
        </div>

        <h1 className="text-2xl font-semibold text-center text-[color:var(--accent-color)] mb-4 font-newsreader">
          Create Your Account
        </h1>
        <p className="text-center text-[color:var(--primary-color)]/80 mb-6 text-sm">
          Try all features for free with your 7-day trial. <br /><b>Cancel or upgrade anytime</b>.
        </p>

        {/* Display social auth message if present */}
        {socialAuthMessage && (
          <div className="mb-4 p-3 rounded-md bg-green-100 border border-green-300 text-green-700 text-sm text-center">
            {socialAuthMessage}
          </div>
        )}

        {/* General Error messages (show if no specific social auth message) */}
        {error && !socialAuthMessage && <p className="text-sm text-red-500 text-center mb-4">{error}</p>}

        {/* Social Logins First */}
        {/* Show social login buttons ONLY IF user is NOT yet socially authenticated */}
        {!sociallyAuthenticatedUser && (
          <div className="mb-6">
            <Auth
              supabaseClient={supabase}
              appearance={{ theme: ThemeSupa }}
              providers={['google']}
              socialLayout="horizontal"
              onlyThirdPartyProviders={true}
              redirectTo={`${getURL()}signup?from_oauth=true`}
              localization={{
                variables: {
                  // ... existing code ...
                },
              }}
            />
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Conditionally render email/password form fields */}
          {!sociallyAuthenticatedUser && (
            <>
              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-[color:var(--border-color)]/30"></span>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-[color:var(--card-bg)] px-2 text-[color:var(--muted-text-color)]">Or sign up with email</span>
                </div>
              </div>
            
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-[color:var(--text-color-secondary)] mb-1">Email address</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your.email@example.com"
                  required
                  disabled={loading || !!sociallyAuthenticatedUser} // Disable if loading or socially authenticated
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
                    disabled={loading || !!sociallyAuthenticatedUser} // Disable if loading or socially authenticated
                    className="auth-input w-full px-3 py-2 rounded-md border border-[color:var(--input-border-color)] bg-[color:var(--input-bg-color)] text-[color:var(--text-color)] placeholder-[color:var(--input-placeholder-color)] focus:outline-none focus:ring-1 focus:ring-[#C79553] focus:border-[#C79553]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-[color:var(--muted-text-color)] hover:text-[color:var(--text-color)]"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    disabled={!!sociallyAuthenticatedUser}
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
                    disabled={loading || !!sociallyAuthenticatedUser} // Disable if loading or socially authenticated
                    className="auth-input w-full px-3 py-2 rounded-md border border-[color:var(--input-border-color)] bg-[color:var(--input-bg-color)] text-[color:var(--text-color)] placeholder-[color:var(--input-placeholder-color)] focus:outline-none focus:ring-1 focus:ring-[#C79553] focus:border-[#C79553]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-[color:var(--muted-text-color)] hover:text-[color:var(--text-color)]"
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    disabled={!!sociallyAuthenticatedUser}
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Billing Cycle Selection Section - always visible */}
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

          {/* Error messages for billing/submit specifically (show if there's a socialAuthMessage, meaning user is in that flow) */}
          {error && socialAuthMessage && <p className="text-sm text-red-500 text-center pt-1">{error}</p>}

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

export default function SignupPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SignupFormContent />
    </Suspense>
  );
} 