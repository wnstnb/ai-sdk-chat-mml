'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../../lib/supabase/client'; // Adjusted path

// Helper function to get the site URL (can be moved to a shared utils file later)
const getURL = () => {
  let url =
    process?.env?.NEXT_PUBLIC_SITE_URL ??
    process?.env?.NEXT_PUBLIC_VERCEL_URL ??
    'http://localhost:3000/';
  url = url.includes('http') ? url : `https://${url}`;
  url = url.charAt(url.length - 1) === '/' ? url : `${url}/`;
  return url;
};

export default function ResetPasswordPage() {
  const router = useRouter();
  // const searchParams = useSearchParams(); // We'll need this later for the token

  const [newPassword, setNewPassword] = React.useState('');
  const [confirmNewPassword, setConfirmNewPassword] = React.useState('');
  const [showNewPassword, setShowNewPassword] = React.useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');
  // const [accessToken, setAccessToken] = React.useState<string | null>(null);

  // useEffect to extract token from URL - will be needed for Supabase password update
  // React.useEffect(() => {
  //   // Supabase sends the access token in the fragment (#) part of the URL
  //   // when the user clicks the password reset link.
  //   const hash = window.location.hash;
  //   const params = new URLSearchParams(hash.substring(1)); // remove #
  //   const token = params.get('access_token');
    
  //   if (token) {
  //     setAccessToken(token);
  //     // Optionally, you can remove the token from the URL
  //     // window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
  //   } else {
  //     //setError("No reset token found. Please ensure you've used the correct link from your email.");
  //     // router.push('/login'); // Or display an error message
  //   }
  // }, [router]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (newPassword !== confirmNewPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    // if (!accessToken) {
    //   setError("Password reset token is missing or invalid. Please try the reset link again.");
    //   return;
    // }

    setLoading(true);

    try {
      // // When the user is redirected from the email link, the new session is not yet active.
      // // We need to use the access token from the URL fragment to update the user's password.
      // const { error: updateError } = await supabase.auth.updateUser({
      //   password: newPassword,
      // } , {  }); // The access token is implicitly handled by Supabase client if it's in the URL fragment and a session recovery event is triggered.
      // // Or, if you extracted it manually:
      // // const { data, error: updateError } = await supabase.auth.updateUser(
      // //   { password: newPassword },
      // //   {
      // //     // You might not need to pass the access token explicitly if Supabase client picks it up
      // //     // from the URL fragment after setSession (if that's how your flow is set up).
      // //     // Check Supabase docs for `updateUser` with access_token if needed.
      // //   }
      // // );


      // // The most common Supabase flow for password reset is:
      // // 1. User clicks link, lands on this page. URL has #access_token=...
      // // 2. Supabase client automatically detects this and establishes a temporary session.
      // // 3. You call supabase.auth.updateUser({ password: newPassword })
      
      // For this to work, Supabase needs to have processed the token from the URL fragment.
      // This typically happens automatically when the Supabase client initializes on the page.
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });


      if (updateError) {
        console.error('Error updating password:', updateError);
        // More specific error handling based on Supabase error codes
        if (updateError.message.includes("Invalid token") || updateError.message.includes("expired")) {
            setError("Your password reset link is invalid or has expired. Please request a new one.");
        } else if (updateError.message.includes("same password")) {
            setError("Your new password cannot be the same as your old password.");
        }
        else {
            setError(updateError.message || 'Failed to update password. Please try again.');
        }
        return;
      }

      setMessage('Password updated successfully! You can now login with your new password.');
      // Optionally redirect to login after a delay
      setTimeout(() => {
        router.push('/login');
      }, 3000);

    } catch (err: any) {
      console.error('Password reset process error:', err);
      setError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
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

        <h1 className="text-2xl font-semibold text-center text-[color:var(--accent-color)] mb-6 font-newsreader">
          Reset Your Password
        </h1>

        {/* General Error messages */}
        {error && <p className="text-sm text-red-500 text-center mb-4">{error}</p>}
        {message && <p className="text-sm text-green-500 text-center mb-4">{message}</p>}
        
        {!message && ( // Hide form if success message is shown
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-[color:var(--text-color-secondary)] mb-1">New Password</label>
              <div className="relative">
                <input
                  id="new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter your new password"
                  required
                  minLength={6}
                  disabled={loading}
                  className="auth-input w-full px-3 py-2 rounded-md border border-[color:var(--input-border-color)] bg-[color:var(--input-bg-color)] text-[color:var(--text-color)] placeholder-[color:var(--input-placeholder-color)] focus:outline-none focus:ring-1 focus:ring-[#C79553] focus:border-[#C79553]"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-[color:var(--muted-text-color)] hover:text-[color:var(--text-color)]"
                  aria-label={showNewPassword ? "Hide password" : "Show password"}
                >
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirm-new-password" className="block text-sm font-medium text-[color:var(--text-color-secondary)] mb-1">Confirm New Password</label>
              <div className="relative">
                <input
                  id="confirm-new-password"
                  type={showConfirmNewPassword ? 'text' : 'password'}
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Confirm your new password"
                  required
                  disabled={loading}
                  className="auth-input w-full px-3 py-2 rounded-md border border-[color:var(--input-border-color)] bg-[color:var(--input-bg-color)] text-[color:var(--text-color)] placeholder-[color:var(--input-placeholder-color)] focus:outline-none focus:ring-1 focus:ring-[#C79553] focus:border-[#C79553]"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-[color:var(--muted-text-color)] hover:text-[color:var(--text-color)]"
                  aria-label={showConfirmNewPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            
            <div className="pt-2">
              <button 
                type="submit" 
                className="w-full justify-center text-sm py-3 px-4 rounded-md font-medium 
                           bg-[color:var(--primary-color)] text-[color:var(--bg-color)] 
                           hover:bg-[color:var(--accent-color)] 
                           focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#C79553]"
                disabled={loading}
              >
                {loading ? 'Resetting Password...' : 'Set New Password'}
              </button>
            </div>
          </form>
        )}

        <div className="text-center text-sm mt-8">
          <Link href="/login" className="font-medium text-[color:var(--anchor-text-color)] hover:text-[color:var(--anchor-text-hover-color)] hover:underline">
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
} 