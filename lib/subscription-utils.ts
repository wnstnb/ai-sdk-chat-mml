import { createSupabaseServiceRoleClient } from './supabase/server';

export interface SubscriptionStatus {
  hasAccess: boolean;
  status: string | null;
  trialEndsAt: string | null;
  subscriptionEndsAt: string | null;
  reason?: string;
}

/**
 * Check if a user has active subscription access
 * @param userId - The user's Supabase auth ID
 * @returns Promise<SubscriptionStatus> - Object containing access status and details
 */
export async function checkSubscriptionStatus(userId: string): Promise<SubscriptionStatus> {
  const supabase = createSupabaseServiceRoleClient();
  
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('stripe_subscription_status, trial_ends_at, subscription_ends_at')
      .eq('id', userId)
      .single();

    if (error || !data) {
      console.error(`Subscription check error for user ${userId}:`, error);
      return {
        hasAccess: false,
        status: null,
        trialEndsAt: null,
        subscriptionEndsAt: null,
        reason: 'Profile not found or database error'
      };
    }

    const now = new Date();
    const status = data.stripe_subscription_status;
    const trialEndsAt = data.trial_ends_at;
    const subscriptionEndsAt = data.subscription_ends_at;

    // Check different subscription states
    switch (status) {
      case 'legacy':
        // Legacy user with grandfathered access
        return {
          hasAccess: true,
          status,
          trialEndsAt,
          subscriptionEndsAt,
          reason: 'Legacy user with grandfathered access'
        };

      case 'trialing':
        // User is in trial period
        if (trialEndsAt && new Date(trialEndsAt) > now) {
          return {
            hasAccess: true,
            status,
            trialEndsAt,
            subscriptionEndsAt,
            reason: 'Active trial'
          };
        } else {
          return {
            hasAccess: false,
            status,
            trialEndsAt,
            subscriptionEndsAt,
            reason: 'Trial expired'
          };
        }

      case 'active':
        // Active paying subscription
        return {
          hasAccess: true,
          status,
          trialEndsAt,
          subscriptionEndsAt,
          reason: 'Active subscription'
        };

      case 'past_due':
        // Payment failed but subscription still active (grace period)
        // Allow access for a short grace period (e.g., 3 days)
        if (subscriptionEndsAt) {
          const gracePeriodEnd = new Date(subscriptionEndsAt);
          gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 3); // 3-day grace period
          
          if (gracePeriodEnd > now) {
            return {
              hasAccess: true,
              status,
              trialEndsAt,
              subscriptionEndsAt,
              reason: 'Grace period (payment overdue)'
            };
          }
        }
        
        return {
          hasAccess: false,
          status,
          trialEndsAt,
          subscriptionEndsAt,
          reason: 'Payment overdue - grace period expired'
        };

      case 'canceled':
        // Subscription was canceled
        // Allow access until the end of the current billing period
        if (subscriptionEndsAt && new Date(subscriptionEndsAt) > now) {
          return {
            hasAccess: true,
            status,
            trialEndsAt,
            subscriptionEndsAt,
            reason: 'Canceled but valid until period end'
          };
        } else {
          return {
            hasAccess: false,
            status,
            trialEndsAt,
            subscriptionEndsAt,
            reason: 'Subscription canceled and expired'
          };
        }

      case 'incomplete':
      case 'incomplete_expired':
      case 'unpaid':
        // Subscription setup failed or payment issues
        return {
          hasAccess: false,
          status,
          trialEndsAt,
          subscriptionEndsAt,
          reason: 'Subscription setup incomplete or payment failed'
        };

      case null:
      case undefined:
        // No subscription data - might be a new user who hasn't completed signup
        return {
          hasAccess: false,
          status,
          trialEndsAt,
          subscriptionEndsAt,
          reason: 'No subscription found'
        };

      default:
        // Unknown status
        console.warn(`Unknown subscription status for user ${userId}: ${status}`);
        return {
          hasAccess: false,
          status,
          trialEndsAt,
          subscriptionEndsAt,
          reason: `Unknown subscription status: ${status}`
        };
    }

  } catch (error: any) {
    console.error(`Exception checking subscription for user ${userId}:`, error);
    return {
      hasAccess: false,
      status: null,
      trialEndsAt: null,
      subscriptionEndsAt: null,
      reason: 'System error checking subscription'
    };
  }
}

/**
 * Simple boolean check for subscription access
 * @param userId - The user's Supabase auth ID
 * @returns Promise<boolean> - True if user has access, false otherwise
 */
export async function hasSubscriptionAccess(userId: string): Promise<boolean> {
  const status = await checkSubscriptionStatus(userId);
  return status.hasAccess;
} 