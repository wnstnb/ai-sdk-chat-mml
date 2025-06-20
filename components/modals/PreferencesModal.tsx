'use client';

import React, { useState, useEffect } from 'react';
import { X, CreditCard, Settings, Palette } from 'lucide-react';
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline';
import { usePreferenceStore } from '@/lib/stores/preferenceStore';
import { ModelSelector } from '@/components/ModelSelector';
import { AIInteractionPreferences } from '@/components/modals/AIInteractionPreferences';
import UsernameManager from '@/components/modals/UsernameManager';
import { supabase } from '@/lib/supabase/client';

interface PreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'general' | 'style';

const PreferencesModal: React.FC<PreferencesModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabType>('general');
  
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
  const currentModel = default_model ?? 'gpt-4.1';
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

  const tabs = [
    { id: 'general' as TabType, label: 'General', icon: Settings },
    { id: 'style' as TabType, label: 'Style', icon: Palette },
  ];

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 backdrop-blur-md flex items-center justify-center z-[1050] p-4 transition-opacity duration-300 ease-in-out"
      onClick={onClose}
    >
      <div
        className="bg-[--bg-color] rounded-lg shadow-xl w-full max-w-2xl text-[--text-color] transform transition-all duration-300 ease-in-out scale-95 opacity-0 animate-modalFadeIn max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-3 flex justify-between items-center">
          <h2 className="text-sm font-semibold">Preferences</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-[--hover-bg]"
            aria-label="Close preferences"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-[--border-color]">
          <nav className="px-3">
            <div className="flex space-x-1">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-t-md transition-colors ${
                    activeTab === id
                      ? 'bg-[--primary-color] text-[--primary-contrast-text] border-b-2 border-[--primary-color]'
                      : 'text-[--muted-text-color] hover:text-[--text-color] hover:bg-[--hover-bg]'
                  }`}
                >
                  <Icon size={12} />
                  {label}
                </button>
              ))}
            </div>
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3">
          {/* Handle loading state */}
          {!isInitialized && (
            <div className="p-3 text-center text-[--muted-text-color] text-xs">
              Loading preferences...
            </div>
          )}

          {/* Handle error state */}
          {preferenceError && (
            <div className="mb-3 p-2 bg-red-100 border border-red-400 text-red-700 rounded-md dark:bg-red-900/30 dark:border-red-700/50 dark:text-red-400">
              <p className="text-xs font-medium">Error</p>
              <p className="text-xs">{preferenceError}</p>
            </div>
          )}

          {/* Tab Content */}
          {isInitialized && (
            <>
              {activeTab === 'general' && (
                <div className="space-y-5">
                  {/* Theme Section */}
                  <div className="space-y-2">
                    <div>
                      <h4 className="text-xs font-medium text-[--text-color] mb-1">Theme</h4>
                      <p className="text-xs text-[--muted-text-color]">Choose your preferred appearance</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setTheme('light')}
                        disabled={currentTheme === 'light'}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-md border transition-colors 
                                    ${currentTheme === 'light' 
                                        ? 'bg-[--primary-color] text-[--primary-contrast-text] border-[--primary-color]' 
                                        : 'bg-transparent border-[--border-color] hover:bg-[--hover-bg]'
                                    }
                                    disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        <SunIcon className="h-3 w-3" /> Light
                      </button>
                      <button
                        onClick={() => setTheme('dark')}
                        disabled={currentTheme === 'dark'}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-md border transition-colors 
                                    ${currentTheme === 'dark' 
                                        ? 'bg-[--primary-color] text-[--primary-contrast-text] border-[--primary-color]' 
                                        : 'bg-transparent border-[--border-color] hover:bg-[--hover-bg]'
                                    }
                                    disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        <MoonIcon className="h-3 w-3" /> Dark
                      </button>
                    </div>
                  </div>

                  {/* Username Section */}
                  <UsernameManager />

                  {/* Default Model Section */}
                  <div className="space-y-2">
                    <div>
                      <h4 className="text-xs font-medium text-[--text-color] mb-1">Default Model</h4>
                      <p className="text-xs text-[--muted-text-color]">Applied when starting new conversations</p>
                    </div>
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
                  </div>

                  {/* Manage Subscription Section */}
                  <div className="space-y-2">
                    <div>
                      <h4 className="text-xs font-medium text-[--text-color] mb-1">Manage Subscription</h4>
                      <p className="text-xs text-[--muted-text-color]">View billing history and manage your subscription</p>
                    </div>
                    <button
                      onClick={handleManagePlan}
                      disabled={isRedirectingToBilling}
                      className="flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-md border border-[--border-color] hover:bg-[--hover-bg] transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full"
                    >
                      <CreditCard className="h-3 w-3" />
                      {isRedirectingToBilling ? 'Redirecting...' : 'Manage Plan'}
                    </button>

                    {/* Billing info details */}
                    {isBillingInfoLoading && (
                      <p className="text-xs text-[--muted-text-color]">Loading billing details...</p>
                    )}
                    {billingInfoError && (
                      <p className="text-xs text-red-500">{billingInfoError}</p>
                    )}
                    {billingInfo && !isBillingInfoLoading && !billingInfoError && (
                      <div className="text-xs text-[--muted-text-color] space-y-1 p-2 bg-[--card-bg] border border-[--border-color] rounded-md">
                        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                          <div><span className="font-medium text-[--text-color]">Email:</span></div>
                          <div className="truncate">{billingInfo.email || '-'}</div>
                          <div><span className="font-medium text-[--text-color]">Billing Cycle:</span></div>
                          <div>{billingInfo.billing_cycle || '-'}</div>
                          <div><span className="font-medium text-[--text-color]">Trial Ends:</span></div>
                          <div>{billingInfo.trial_ends_at ? new Date(billingInfo.trial_ends_at).toLocaleDateString() : '-'}</div>
                          <div><span className="font-medium text-[--text-color]">Subscription End:</span></div>
                          <div>{billingInfo.subscription_ends_at ? new Date(billingInfo.subscription_ends_at).toLocaleDateString() : '-'}</div>
                          <div><span className="font-medium text-[--text-color]">Status:</span></div>
                          <div>{billingInfo.stripe_subscription_status || '-'}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'style' && (
                <div className="space-y-5">
                  {/* Font Size Section */}
                  <div className="space-y-3">
                    <div>
                      <h4 className="text-xs font-medium text-[--text-color] mb-1">Font Sizes</h4>
                      <p className="text-xs text-[--muted-text-color]">Adjust font sizes for different areas</p>
                    </div>
                    
                    <div className="space-y-3">
                      {/* Editor Font Size */}
                      <div className="space-y-1">
                        <label htmlFor="editorFontSize" className="text-xs font-medium text-[--text-color]">
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
                          className="w-full px-2 py-1 text-xs bg-[--input-bg] border border-[--border-color] rounded-md focus:ring-1 focus:ring-[--primary-color] focus:border-[--primary-color] outline-none"
                        />
                      </div>

                      {/* Chat Font Size */}
                      <div className="space-y-1">
                        <label htmlFor="chatFontSize" className="text-xs font-medium text-[--text-color]">
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
                          className="w-full px-2 py-1 text-xs bg-[--input-bg] border border-[--border-color] rounded-md focus:ring-1 focus:ring-[--primary-color] focus:border-[--primary-color] outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* AI Interaction Preferences */}
                  <div className="space-y-2">
                    <div>
                      <h4 className="text-xs font-medium text-[--text-color] mb-1">AI Interactions</h4>
                      <p className="text-xs text-[--muted-text-color]">Customize AI highlighting, notifications, and message pane behavior</p>
                    </div>
                    <AIInteractionPreferences />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[--border-color] flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1 text-xs bg-[--primary-color] text-[--primary-contrast-text] rounded-md hover:bg-[--primary-color-hover] transition-colors"
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