'use client';

import Link from 'next/link';
import { CheckCircle } from 'lucide-react';

export default function SignupSuccessPage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[url('/tuon-bg.png')] bg-cover bg-center p-4">
      <div className="w-full max-w-md bg-[color:var(--card-bg)]/80 backdrop-blur-lg rounded-xl shadow-2xl border border-[color:var(--border-color)]/30 p-8 text-center">
        <div className="flex flex-col items-center mb-6">
          <Link href="/" className="flex items-center mb-2">
            <img src="/tuon-logo-svg-type.svg" alt="Tuon Logo" className="h-12 w-12 mr-2" style={{ filter: 'var(--logo-filter)' }} />
            {/* <span className="text-3xl font-bold text-[color:var(--accent-color)] font-newsreader">tuon.io</span> */}
          </Link>
        </div>

        <CheckCircle size={60} className="text-green-500 mx-auto mb-5" />

        <h1 className="text-2xl font-semibold text-center text-[color:var(--accent-color)] mb-4 font-newsreader">
          Signup Successful!
        </h1>
        <p className="text-center text-[color:var(--primary-color)]/90 mb-3 text-md">
          Welcome to Tuon! Your account has been created and your 7-day free trial is now active.
        </p>
        <p className="text-center text-[color:var(--primary-color)]/70 mb-8 text-sm">
          You can now explore all the features. Get ready to Bring it all into focus
        </p>
        
        <div className="mt-6 flex flex-col space-y-3">
          <Link 
            href="/launch" 
            className="w-full block text-center text-md py-3 px-4 rounded-md font-medium 
                         bg-[color:var(--primary-color)] text-[color:var(--bg-color)] 
                         hover:bg-[color:var(--accent-color)] 
                         focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#C79553]"
          >
            Go to Dashboard
          </Link>
          <Link 
            href="/login" 
            className="w-full block text-center text-sm py-2 px-4 rounded-md font-medium 
                         text-[color:var(--anchor-text-color)] hover:text-[color:var(--anchor-text-hover-color)] 
                         focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#C79553] hover:underline"
          >
            Login to your account
          </Link>
        </div>

        <p className="text-xs text-[color:var(--primary-color)]/60 mt-8">
          If you have any questions, feel free to reach out to support@tuon.io.
        </p>
      </div>
    </div>
  );
} 