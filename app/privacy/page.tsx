'use client';

import React from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';

const privacyContent = `
# Privacy Policy

**Effective Date: 2025-05-17**

Welcome to tuon.io, an application by dodatathings.dev ("we", "us", or "our"). We are committed to protecting your privacy and keeping your personal information secure. This Privacy Policy explains how we collect, use, store, and protect your information when you use our app and services ("Services").

## 1. Information We Collect

We collect information to provide and improve our Services. The types of information we may collect include:

* **Account Information:** When you create an account, we may collect your email address and other necessary information.

* **User Content:** We store the documents, notes, files, and other content you create, upload, or share using our Services.

* **Usage Data:** We may collect information about how you use the app, such as features accessed, interactions, and device information.

* **Communications:** If you contact us for support or feedback, we may collect your contact information and the content of your communication.

## 2. How We Use Your Information

We use your information to:

* Provide, operate, and improve our Services

* Store, process, and display your User Content as necessary for the app to function

* Respond to your inquiries and provide support

* Ensure the security and integrity of our Services

* Comply with legal obligations

## 3. Sharing and Disclosure

We do not sell your personal information. We may share your information only in the following circumstances:

* **Service Providers:** With trusted third parties who help us operate and improve our Services (e.g., hosting, analytics), under strict confidentiality agreements.

* **Legal Requirements:** If required by law, regulation, legal process, or governmental request.

* **Protection of Rights:** To protect the rights, property, or safety of our users, ourselves, or others.

## 4. Data Storage and Security

We store your data to provide the Services. We take reasonable measures to protect your information from unauthorized access, loss, or misuse. However, no system is completely secure, and we cannot guarantee absolute security.

## 5. Your Rights and Choices

* **Access and Correction:** You may access and update your account information at any time.

* **Data Deletion:** You may request deletion of your account and associated data by contacting us at the email below.

* **Sharing:** If you share documents or notes, you are responsible for ensuring you have the right to share all included content.

## 6. Children's Privacy

You must be at least 13 years old (or the minimum age required in your jurisdiction) to use our Services. We do not knowingly collect personal information from children under 13.

## 7. Changes to This Policy

We may update this Privacy Policy from time to time. We will notify you of significant changes. Continued use of the Services after changes means you accept the new policy.

## 8. Contact Us

If you have questions or concerns about this Privacy Policy, please contact us at: <support@dodatathings.dev>

This Privacy Policy is designed to be consistent with our Terms of Service. For more details on your rights and responsibilities, please refer to the Terms of Service.
`;

export default function PrivacyPage() {
  return (
    // Force dark theme for privacy policy page regardless of user preference
    <div data-theme="dark">
      <main className="text-[color:var(--text-color)] bg-[color:var(--bg-color)] min-h-screen">
        <header className="container mx-auto px-6 py-6 flex items-center justify-between relative z-20">
          <div className="flex items-center">
            <Link href="/">
              <img src="/tuon-logo-svg-type.svg" alt="Tuon Logo" className="h-8 w-8 cursor-pointer" style={{ filter: 'var(--logo-filter)' }} />
            </Link>
          </div>
        </header>
        <div className="container mx-auto px-6 py-12 flex justify-center">
          <div className="max-w-4xl w-full">
            <div className="bg-[color:var(--card-bg)]/70 backdrop-blur-lg p-8 md:p-10 rounded-xl border border-[color:var(--border-color)]/25 shadow-xl">
              <div className="prose prose-lg max-w-none text-white">
                <ReactMarkdown
                  components={{
                    h1: ({children}) => <h1 className="text-white text-3xl font-bold mb-6">{children}</h1>,
                    h2: ({children}) => <h2 className="text-white text-2xl font-semibold mt-8 mb-4">{children}</h2>,
                    h3: ({children}) => <h3 className="text-white text-xl font-medium mt-6 mb-3">{children}</h3>,
                    p: ({children}) => <p className="text-gray-200 mb-4 leading-relaxed">{children}</p>,
                    ul: ({children}) => <ul className="text-gray-200 mb-4 ml-6 space-y-2">{children}</ul>,
                    li: ({children}) => <li className="text-gray-200">{children}</li>,
                    strong: ({children}) => <strong className="text-white font-semibold">{children}</strong>,
                    a: ({children, href}) => <a href={href} className="text-blue-400 hover:text-blue-300 underline">{children}</a>
                  }}
                >
                  {privacyContent}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
        <footer className="py-12 bg-[color:var(--bg-color)] relative z-20">
          <div className="container mx-auto px-6 text-center text-sm text-[color:var(--primary-color)]/60">
            © {new Date().getFullYear()} dodatathings.dev. All rights reserved. 
            <Link href="/terms" className="ml-4 hover:text-[color:var(--accent-color)]">Terms of Service</Link>
          </div>
        </footer>
      </main>
    </div>
  );
} 