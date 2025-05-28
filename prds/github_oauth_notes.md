# GitHub OAuth Flow - Current Status and Issues

This document outlines the current state of the GitHub OAuth integration, the issues encountered, and the debugging steps taken.

## Desired Behavior

1. User clicks "Sign up with GitHub" on the `/signup` page.
2. User authenticates with GitHub.
3. User is redirected back to `https://www.tuon.io/signup?from_oauth=true` (or a similar URL indicating social auth completion).
4. The `/signup` page recognizes the user is authenticated, hides the email/password form and social login buttons, and prompts the user to select a billing plan to complete their signup.
5. User selects a plan and is redirected to Stripe checkout.
6. After successful payment, the user is redirected to `/launch?signup=success`.

## Current Behavior (Problem)

1. User clicks "Sign up with GitHub" on the `/signup` page.
2. User successfully authenticates with GitHub.
3. User is redirected to `https://www.tuon.io/auth/callback?code=...&next=%2Flaunch` (as seen in Vercel logs).
4. The `app/auth/callback/route.ts` handler then redirects the user to `https://www.tuon.io/launch`.
5. The `middleware.ts` intercepts the request to `/launch`, detects the user has no active subscription, and redirects to `https://www.tuon.io/subscription-required?reason=subscription_required`.

This differs from the Google OAuth flow, which correctly redirects back to the `/signup` page to complete plan selection.

## Root Cause Analysis

The core issue is that when Supabase handles the callback from GitHub, it is **not** using the `redirectTo` parameter (`${getURL()}signup?from_oauth=true`) that was specified in the `supabase.auth.signInWithOAuth` call within `app/signup/page.tsx`. Instead, Supabase itself is generating a redirect to the application's `/auth/callback` route with the `next` query parameter set to `/launch`.

## Debugging Steps Taken

1.  **Verified GitHub OAuth App Configuration:**
    *   The "Authorization callback URL" in the GitHub OAuth App settings is correctly set to the Supabase endpoint: `https://ikbmdbgxdprtcgasdijz.supabase.co/auth/v1/callback`.

2.  **Verified Supabase Provider Configuration (GitHub):**
    *   The Supabase dashboard settings for the GitHub provider do not have an explicit "Redirect URI" field that would override the client-side `redirectTo`. It only contains Client ID, Client Secret, and the Supabase callback URL.

3.  **Analyzed `app/auth/callback/route.ts`:**
    *   Added logging to this route.
    *   Vercel logs confirmed that this route receives `next=/launch` in the query string when the flow originates from GitHub.
    *   The route correctly exchanges the code for a session and then redirects to the path specified in the `next` parameter.

4.  **Inspected `app/signup/page.tsx`:**
    *   The `redirectTo` parameter for the `<Auth>` component (which calls `supabase.auth.signInWithOAuth`) was initially set to `${getURL()}auth/callback?next=/signup%3Fsocial%3Dtrue`.
    *   This was later simplified to `${getURL()}signup?from_oauth=true` to make the final intended destination clearer and to test if Supabase would honor a direct path if it was in the allowlist.
    *   A `getURL()` helper function was added to ensure correct URL construction.

5.  **Reviewed Supabase Authentication URL Configuration:**
    *   The user was advised to check the main "Site URL" and the list of "Redirect URLs" in the Supabase dashboard (Authentication -> URL Configuration).
    *   The hypothesis is that `https://www.tuon.io/signup` (or a pattern matching it) might not be in the allowlist of "Redirect URLs", or that a default/fallback redirect in Supabase (possibly the Site URL if it points to `/launch`) is taking precedence over the `redirectTo` from the client, specifically for the GitHub provider.

## Unresolved Issue

Despite these checks, Supabase continues to redirect to `/auth/callback?next=/launch` after a successful GitHub authentication, instead of respecting the `redirectTo` value provided in the `signInWithOAuth` options from `app/signup/page.tsx`.

The Google OAuth flow works as expected, suggesting the issue is specific to how Supabase handles or prioritizes redirect parameters for the GitHub provider, or a subtle difference in how the `redirectTo` is being processed or overridden by Supabase based on its internal configuration or allowlists when GitHub is the provider.

**Next Steps (when resuming):**

*   Double-check all Supabase Authentication URL Configuration settings, especially the **Site URL** and the **Redirect URLs** allowlist.
*   Experiment with different formats for the `redirectTo` in `app/signup/page.tsx` for the GitHub provider, though the current direct URL (`${getURL()}signup?from_oauth=true`) should be the most straightforward.
*   Consider if there are any legacy settings or configurations within the Supabase project specific to GitHub that might be overriding the `redirectTo` behavior.
*   Review Supabase documentation or seek Supabase support for provider-specific `redirectTo` behaviors if the URL configuration settings don't reveal the cause. 