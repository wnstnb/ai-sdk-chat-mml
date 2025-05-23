'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon } from '@heroicons/react/24/outline';

function SubscriptionRequiredContent() {
  const searchParams = useSearchParams();
  const reason = searchParams.get('reason');
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getUser = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
    };
    getUser();
  }, []);

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

          <div className="space-y-4">
            <button
              onClick={() => window.location.href = '/api/stripe/create-checkout-session'}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Start Subscription
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