'use client';

import React, { useState, useEffect } from 'react';
import { X, CreditCard } from 'lucide-react';
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline';
import { usePreferenceStore } from '@/lib/stores/preferenceStore';
import { ModelSelector } from '@/components/ModelSelector';
import { supabase } from '@/lib/supabase/client';

interface PreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PreferencesModal: React.FC<PreferencesModalProps> = ({ isOpen, onClose }) => {
  // Get state and actions from the store
  const { 
    theme, 
    default_model, 
    editorFontSize,
    chatFontSize,
    setTheme, 
    setDefaultModel, 
    setEditorFontSize,
    setChatFontSize,
    isInitialized, 
    preferenceError 
  } = usePreferenceStore();

  const [isRedirectingToBilling, setIsRedirectingToBilling] = useState(false);
  const [billingInfo, setBillingInfo] = useState<{ email?: string; billing_cycle?: string | null; subscription_ends_at?: string | null; trial_ends_at?: string | null; stripe_subscription_status?: string | null } | null>(null);
  const [isBillingInfoLoading, setIsBillingInfoLoading] = useState(false);
  const [billingInfoError, setBillingInfoError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBillingInfo = async () => {
      if (!isOpen) return;
      setIsBillingInfoLoading(true);
      setBillingInfoError(null);
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
          throw new Error('User not authenticated');
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('email, billing_cycle, subscription_ends_at, stripe_subscription_status')
          .eq('id', user.id)
          .single();

        if (error) {
          throw error;
        }
        setBillingInfo(data);
      } catch (err: any) {
        console.error('Error fetching billing info:', err);
        setBillingInfoError(err.message || 'Failed to load billing information');
      } finally {
        setIsBillingInfoLoading(false);
      }
    };

    fetchBillingInfo();
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  // Ensure fallbacks for the values
  const currentModel = default_model ?? 'gemini-2.5-flash-preview-05-20';
  const currentTheme = theme ?? 'dark';
  const currentEditorFontSize = editorFontSize ?? 1;
  const currentChatFontSize = chatFontSize ?? 1;

  const handleManagePlan = async () => {
    setIsRedirectingToBilling(true);
    
    try {
      // Create a Stripe customer portal session
      const response = await fetch('/api/billing/create-portal-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to redirect to billing portal' }));
        throw new Error(errorData.error || 'Failed to access billing portal');
      }

      const { url } = await response.json();
      
      // Redirect to Stripe customer portal
      window.open(url, '_blank');
    } catch (error) {
      console.error('Error redirecting to billing portal:', error);
      // You could show a toast notification here
      alert('Unable to access billing portal. Please try again later.');
    } finally {
      setIsRedirectingToBilling(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-opacity duration-300 ease-in-out"
      onClick={onClose}
    >
      <div
        className="bg-[--bg-color] p-6 rounded-lg shadow-xl w-full max-w-md text-[--text-color] transform transition-all duration-300 ease-in-out scale-95 opacity-0 animate-modalFadeIn max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6 flex-shrink-0">
          <h2 className="text-xl font-semibold">Preferences</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-[--hover-bg]"
            aria-label="Close preferences"
          >
            <X size={24} />
          </button>
        </div>

        {/* Handle loading state */}
        {!isInitialized && (
          <div className="p-4 text-center text-[--muted-text-color]">
            Loading preferences...
          </div>
        )}

        {/* Handle error state */}
        {preferenceError && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-md dark:bg-red-900/30 dark:border-red-700/50 dark:text-red-400">
            <p className="text-sm font-medium">Error</p>
            <p className="text-xs">{preferenceError}</p>
          </div>
        )}

        {/* Preferences Content */}
        {isInitialized && (
          <div className="flex flex-col gap-6">
            {/* Theme Selector */}
            <div className="flex flex-col gap-3">
              <label className="text-sm font-medium text-[--text-color]">Theme</label>
              <div className="flex gap-3">
                <button
                  onClick={() => setTheme('light')}
                  disabled={currentTheme === 'light'}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm rounded border transition-colors 
                              ${currentTheme === 'light' 
                                  ? 'bg-[--primary-color] text-[--primary-contrast-text] border-[--primary-color]' 
                                  : 'bg-transparent border-[--border-color] hover:bg-[--hover-bg]'
                              }
                              disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <SunIcon className="h-4 w-4" /> Light
                </button>
                <button
                  onClick={() => setTheme('dark')}
                  disabled={currentTheme === 'dark'}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm rounded border transition-colors 
                              ${currentTheme === 'dark' 
                                  ? 'bg-[--primary-color] text-[--primary-contrast-text] border-[--primary-color]' 
                                  : 'bg-transparent border-[--border-color] hover:bg-[--hover-bg]'
                              }
                              disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <MoonIcon className="h-4 w-4" /> Dark
                </button>
              </div>
            </div>

            {/* Default Model Selector */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-[--text-color]">Default Model</label>
              <ModelSelector 
                model={currentModel} 
                setModel={(newModel) => {
                  if (typeof newModel === 'string') {
                    setDefaultModel(newModel);
                  } else {
                    setDefaultModel(newModel(currentModel)); 
                  }
                }}
              />
              <p className="text-xs text-[--muted-text-color]">
                Applied when starting new conversations.
              </p>
            </div>

            {/* Editor Font Size Selector */}
            <div className="flex flex-col gap-2">
              <label htmlFor="editorFontSize" className="text-sm font-medium text-[--text-color]">
                Editor Font Size (rem)
              </label>
              <input
                type="number"
                id="editorFontSize"
                value={currentEditorFontSize}
                onChange={(e) => setEditorFontSize(parseFloat(e.target.value))}
                step="0.1"
                min="0.5"
                max="3"
                className="px-3 py-2 bg-[--input-bg] border border-[--border-color] rounded focus:ring-2 focus:ring-[--primary-color] focus:border-[--primary-color] outline-none"
              />
            </div>

            {/* Chat Font Size Selector */}
            <div className="flex flex-col gap-2">
              <label htmlFor="chatFontSize" className="text-sm font-medium text-[--text-color]">
                Chat Font Size (rem)
              </label>
              <input
                type="number"
                id="chatFontSize"
                value={currentChatFontSize}
                onChange={(e) => setChatFontSize(parseFloat(e.target.value))}
                step="0.1"
                min="0.5"
                max="3"
                className="px-3 py-2 bg-[--input-bg] border border-[--border-color] rounded focus:ring-2 focus:ring-[--primary-color] focus:border-[--primary-color] outline-none"
              />
            </div>

            {/* Billing Section */}
            <div className="flex flex-col gap-3 pt-4 border-t border-[--border-color]">
              <label className="text-sm font-medium text-[--text-color]">Billing & Subscription</label>
              <button
                onClick={handleManagePlan}
                disabled={isRedirectingToBilling}
                className="flex items-center justify-center gap-2 px-4 py-2 text-sm rounded border border-[--border-color] hover:bg-[--hover-bg] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CreditCard className="h-4 w-4" />
                {isRedirectingToBilling ? 'Redirecting...' : 'Manage Plan'}
              </button>
              <p className="text-xs text-[--muted-text-color]">
                View your billing history, update payment methods, and manage your subscription.
              </p>

              {/* Billing info details */}
              {isBillingInfoLoading && (
                <p className="text-xs text-[--muted-text-color]">Loading billing details...</p>
              )}
              {billingInfoError && (
                <p className="text-xs text-red-500">{billingInfoError}</p>
              )}
              {billingInfo && !isBillingInfoLoading && !billingInfoError && (
                <div className="text-xs text-[--muted-text-color] space-y-1 pt-1">
                  <p><span className="font-medium text-[--text-color]">Email:</span> {billingInfo.email || '-'}</p>
                  <p><span className="font-medium text-[--text-color]">Billing Cycle:</span> {billingInfo.billing_cycle || '-'}</p>
                  <p><span className="font-medium text-[--text-color]">Trial Ends At:</span> {billingInfo.trial_ends_at? new Date(billingInfo.trial_ends_at).toLocaleDateString() : '-'}</p>
                  <p><span className="font-medium text-[--text-color]">Subscription End:</span> {billingInfo.subscription_ends_at ? new Date(billingInfo.subscription_ends_at).toLocaleDateString() : '-'}</p>
                  <p><span className="font-medium text-[--text-color]">Status:</span> {billingInfo.stripe_subscription_status || '-'}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer with close button */}
        <div className="flex justify-end mt-6 pt-4 border-t border-[--border-color]">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[--primary-color] text-[--primary-contrast-text] rounded hover:bg-[--primary-color-hover] transition-colors"
          >
            Done
          </button>
        </div>
      </div>

      {/* Modal Animation Styles */}
      <style jsx global>{`
        @keyframes modalFadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-modalFadeIn {
          animation: modalFadeIn 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

export default PreferencesModal; 