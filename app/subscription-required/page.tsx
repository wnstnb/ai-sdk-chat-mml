'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ExclamationTriangleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

function SubscriptionRequiredContent() {
  const searchParams = useSearchParams();
  const reason = searchParams.get('reason');
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const getUser = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
    };
    getUser();
  }, []);

  const handleStartSubscription = async () => {
    if (!user || !user.email) {
      setErrorMessage('User information is not available. Please try signing out and back in.');
      return;
    }
    setIsProcessing(true);
    setErrorMessage('');
    try {
      const priceId = 'price_1RR50wP5ZTVXN3kSg2UPq3OS';
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, email: user.email, userId: user.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to create Stripe checkout session.');
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
      else throw new Error('Could not retrieve the checkout URL. Please try again.');
    } catch (error: any) {
      console.error('Start Subscription Error:', error);
      setErrorMessage(error.message || 'An unexpected error occurred.');
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusMessage = () => {
    let iconClass = "h-12 w-12 text-[color:var(--warning-text-color)]";
    if (reason === 'system_error') iconClass = "h-12 w-12 text-[color:var(--destructive-text-color)]";
    
    switch (reason) {
      case 'subscription_required':
        return {
          icon: <ExclamationTriangleIcon className={iconClass} />,
          title: 'Subscription Required',
          message: 'To access this application, you need an active subscription.',
        };
      case 'system_error':
        return {
          icon: <XCircleIcon className={iconClass} />,
          title: 'System Error',
          message: 'We encountered an error checking your subscription. Please try again.',
        };
      default:
        return {
          icon: <ExclamationTriangleIcon className={iconClass} />,
          title: 'Access Restricted',
          message: 'You need an active subscription to access this application.',
        };
    }
  };

  const statusInfo = getStatusMessage();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[url('/tuon-bg.png')] bg-cover bg-center text-[color:var(--text-color)]">
        Loading your details...
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-[url('/tuon-bg.png')] bg-cover bg-center p-4">
      <div className="w-full max-w-md bg-[color:var(--card-bg)]/70 backdrop-blur-lg rounded-xl shadow-2xl border border-[color:var(--border-color)]/25 p-6 md:p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="flex justify-center mb-4">
            {statusInfo.icon}
          </div>
          <h1 className="text-2xl font-semibold text-center text-[color:var(--accent-color)] font-newsreader">
            {statusInfo.title}
          </h1>
          <p className="mt-2 text-sm text-center text-[color:var(--primary-color)]/80">
            {statusInfo.message}
          </p>
        </div>

        <div className="space-y-6">
          {user && (
            <div className="p-3 bg-[color:var(--input-bg-color)] rounded-md border border-[color:var(--input-border-color)]">
              <p className="text-sm text-center text-[color:var(--muted-text-color)]">
                Signed in as: <span className="font-medium text-[color:var(--text-color)]">{user.email}</span>
              </p>
            </div>
          )}
          {errorMessage && (
            <div className="my-2 p-3 bg-red-700/20 border border-red-500/30 text-red-400 text-sm rounded-md text-center">
              {errorMessage}
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={handleStartSubscription}
              disabled={isProcessing || !user || loading}
              className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium 
                         bg-[color:var(--primary-color)] text-[color:var(--bg-color)] 
                         hover:bg-[color:var(--accent-color)] 
                         focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[color:var(--card-bg)] focus:ring-[color:var(--accent-color)] 
                         disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isProcessing ? 'Processing...' : 'Start Subscription'}
            </button>

            <button
              onClick={() => window.location.href = '/api/stripe/create-portal-session'}
              className="w-full flex justify-center py-2.5 px-4 border border-[color:var(--input-border-color)] rounded-md shadow-sm text-sm font-medium 
                         text-[color:var(--text-color-secondary)] bg-[color:var(--input-bg-color)] 
                         hover:bg-[color:var(--input-border-color)] hover:text-[color:var(--text-color)]
                         focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[color:var(--card-bg)] focus:ring-[color:var(--accent-color)]"
            >
              Manage Existing Subscription
            </button>

            <div className="text-center pt-2">
              <button
                onClick={() => window.location.href = '/login'}
                className="text-[color:var(--anchor-text-color)] hover:text-[color:var(--anchor-text-hover-color)] hover:underline text-sm font-medium"
              >
                Sign Out & Return to Login
              </button>
            </div>
          </div>
        </div>

        <div className="text-center mt-8">
          <p className="text-xs text-[color:var(--muted-text-color)]">
            Having trouble? Contact <a href="mailto:support@tuon.io" className="underline hover:text-[color:var(--anchor-text-hover-color)]">support@tuon.io</a> for assistance.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SubscriptionRequired() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-[url('/tuon-bg.png')] bg-cover bg-center text-[color:var(--text-color)]">
        Loading...
      </div>
    }>
      <SubscriptionRequiredContent />
    </Suspense>
  );
} 