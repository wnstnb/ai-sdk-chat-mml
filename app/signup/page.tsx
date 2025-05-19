'use client';

import React from 'react';
import Link from 'next/link';

export default function SignupPage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[url('/tuon-bg.png')] bg-cover bg-center p-4">
      <div className="w-full max-w-md bg-[color:var(--card-bg)]/70 backdrop-blur-lg rounded-xl shadow-2xl border border-[color:var(--border-color)]/25 p-6 md:p-8">
        <div className="flex flex-col items-center mb-6">
          <Link href="/" className="flex items-center">
            <img src="/tuon-logo-svg-type.svg" alt="Tuon Logo" className="h-10 w-10 mr-2" style={{ filter: 'var(--logo-filter)' }} />
            <span className="text-3xl font-bold text-[color:var(--accent-color)] font-newsreader">tuon.io</span>
          </Link>
          <p className="text-sm text-[color:var(--primary-color)]/70 mt-1">Bring it all into focus.</p>
        </div>

        <h1 className="text-2xl font-semibold text-center text-[color:var(--accent-color)] mb-4 font-newsreader">
          Create Your Account
        </h1>
        <p className="text-center text-[color:var(--primary-color)]/80 mb-6 text-sm">
          Join us and start your 7-day free trial.
        </p>
        
        {/* Placeholder for signup form */}
        <div className="mb-6 p-6 border border-[color:var(--input-border-color)] rounded-lg bg-[color:var(--input-bg-color)]/50 min-h-[100px]">
          <p className="text-center text-[color:var(--muted-text-color)]">
            Signup Form will go here.
            <br />
            (Email, Password, Billing Cycle selection)
          </p>
        </div>

        <div className="text-center text-sm">
          <Link href="/login" className="font-medium text-[color:var(--anchor-text-color)] hover:text-[color:var(--anchor-text-hover-color)] hover:underline">
            Already have an account? Login
          </Link>
        </div>
      </div>
    </div>
  );
} 