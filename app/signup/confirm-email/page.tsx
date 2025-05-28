'use client';

import Link from 'next/link';
import { MailCheck } from 'lucide-react'; // Using MailCheck icon

export default function ConfirmEmailPage() {
  // TODO: Implement resend confirmation email functionality if needed
  const handleResendConfirmation = async () => {
    // Placeholder for resend logic
    alert('Resend confirmation email functionality to be implemented.');
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-[url('/tuon-bg.png')] bg-cover bg-center p-4">
      <div className="w-full max-w-md bg-[color:var(--card-bg)]/80 backdrop-blur-lg rounded-xl shadow-2xl border border-[color:var(--border-color)]/30 p-8 text-center">
        <div className="flex flex-col items-center mb-6">
          <Link href="/" className="flex items-center mb-2">
            <img src="/tuon-logo-svg-type.svg" alt="Tuon Logo" className="h-12 w-12 mr-2" style={{ filter: 'var(--logo-filter)' }} />
            {/* <span className="text-3xl font-bold text-[color:var(--accent-color)] font-newsreader">tuon.io</span> */}
          </Link>
        </div>

        <MailCheck size={60} className="text-white mx-auto mb-5" /> {/* Changed icon and color */}

        <h1 className="text-2xl font-semibold text-center text-[color:var(--accent-color)] mb-4 font-newsreader">
          Confirm Your Email
        </h1>
        <p className="text-center text-[color:var(--primary-color)]/90 mb-3 text-md">
          Your account has been successfully created! 
        </p>
        <p className="text-center text-[color:var(--primary-color)]/80 mb-6 text-sm">
          We&apos;ve sent a confirmation link to your email address. Please click the link in the email to activate your account and complete the signup process.
        </p>
        <p className="text-center text-[color:var(--primary-color)]/70 mb-8 text-sm">
          You won&apos;t be able to log in until your email is confirmed.
        </p>
        
        <div className="mt-6 flex flex-col space-y-3">
          {/* <button 
            onClick={handleResendConfirmation}
            className="w-full text-center text-md py-3 px-4 rounded-md font-medium 
                         bg-transparent border-2 border-[color:var(--primary-color)] text-[color:var(--primary-color)] 
                         hover:bg-[color:var(--primary-color)] hover:text-[color:var(--bg-color)]
                         focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#C79553] transition-colors duration-150"
          >
            Resend Confirmation Email
          </button> */}
          <Link 
            href="/login" 
            className="w-full block text-center text-md py-3 px-4 rounded-md font-medium 
                         bg-[color:var(--primary-color)] text-[color:var(--bg-color)] 
                         hover:bg-[color:var(--accent-color)] 
                         focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#C79553]"
          >
            Go to Login
          </Link>
        </div>

        <p className="text-xs text-[color:var(--primary-color)]/60 mt-8">
          If you don&apos;t see the email, please check your spam folder. If you have any issues, contact support@tuon.io.
        </p>
      </div>
    </div>
  );
} 