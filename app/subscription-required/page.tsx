'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { loadStripe } from '@stripe/stripe-js';

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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId: priceId,
          email: user.email,
          userId: user.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create Stripe checkout session.');
      }

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        console.error('Checkout URL not found in response, data:', data);
        throw new Error('Could not retrieve the checkout URL. Please try again.');
      }

    } catch (error: any) {
      console.error('Start Subscription Error:', error);
      setErrorMessage(error.message || 'An unexpected error occurred.');
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusMessage = () => {
    switch (reason) {
      case 'subscription_required':
        return {
          icon: <ExclamationTriangleIcon className="h-12 w-12 text-yellow-500" />,
          title: 'Subscription Required',
          message: 'To access this application, you need an active subscription.',
          color: 'yellow'
        };
      case 'system_error':
        return {
          icon: <XCircleIcon className="h-12 w-12 text-red-500" />,
          title: 'System Error',
          message: 'We encountered an error checking your subscription. Please try again.',
          color: 'red'
        };
      default:
        return {
          icon: <ExclamationTriangleIcon className="h-12 w-12 text-yellow-500" />,
          title: 'Access Restricted',
          message: 'You need an active subscription to access this application.',
          color: 'yellow'
        };
    }
  };

  const statusInfo = getStatusMessage();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center">
            {statusInfo.icon}
          </div>
          <h1 className="mt-6 text-3xl font-extrabold text-gray-900">
            {statusInfo.title}
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            {statusInfo.message}
          </p>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          {user && (
            <div className="mb-4 p-3 bg-gray-50 rounded">
              <p className="text-sm text-gray-600">
                Signed in as: <span className="font-medium">{user.email}</span>
              </p>
            </div>
          )}
          {errorMessage && (
            <div className="my-2 p-3 bg-red-100 border border-red-300 text-red-700 text-sm rounded-md text-center">
              {errorMessage}
            </div>
          )}

          <div className="space-y-4">
            <button
              onClick={handleStartSubscription}
              disabled={isProcessing || !user || loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isProcessing ? 'Processing...' : 'Start Subscription'}
            </button>

            <button
              onClick={() => window.location.href = '/api/stripe/create-portal-session'}
              className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Manage Existing Subscription
            </button>

            <div className="text-center">
              <button
                onClick={() => window.location.href = '/login'}
                className="text-blue-600 hover:text-blue-500 text-sm font-medium"
              >
                Sign Out & Return to Login
              </button>
            </div>
          </div>
        </div>

        <div className="text-center">
          <p className="text-xs text-gray-500">
            Having trouble? Contact support for assistance.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SubscriptionRequired() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    }>
      <SubscriptionRequiredContent />
    </Suspense>
  );
} 