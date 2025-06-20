'use client';

import React from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';

const termsContent = `
# Terms of Service

**Effective Date: 2025-05-17**

Welcome to tuon.io, an application by dodatathings.dev (“we”, “us”, or “our”). By accessing or using our app and services (“Services”), you agree to these Terms of Service (“Terms”). Please read them carefully.

## 1. Acceptance of Terms

By creating an account or using our Services, you agree to be bound by these Terms and our Privacy Policy. If you do not agree, do not use our Services.

## 2. Eligibility

**Summary:** You must be old enough to use our services—at least 13 years old, or older if required by your country.

You must be at least 13 years old (or the minimum age required in your jurisdiction) to use our Services. By using our Services, you represent and warrant that you meet these requirements.

## 3. User-Generated Content

**Summary:** You own your content, but you're responsible for it. Don't upload anything you don't have rights to.

* **Ownership:** You retain copyright and ownership of the content you create and upload (“User Content”).

* **Responsibility:** You are solely responsible for your User Content. Do not upload, share, or store content you do not have the right to use.

* **Copyright Compliance:** Do not include copyrighted material from third parties without permission. You are responsible for ensuring your content does not infringe on others' rights.

* **License to Us:** By using our Services, you grant us a limited license to store, process, and display your User Content as necessary to provide the Services.

## 4. Sharing and Collaboration

**Summary:** If you share notes or documents, make sure you have the right to share all included content. You are responsible for what you share.

* If you share notes or documents with others, ensure you have the right to share all included content.

* Shared content may be accessible to other users, and you are responsible for any copyright or privacy issues that arise from sharing.

## 5. Use of Third-Party Content

**Summary:** Only use third-party content if you have the proper rights or licenses. We are not responsible for what you upload.

* If you incorporate third-party content (e.g., images, text, videos), you must have the appropriate licenses or permissions.

* We are not responsible for content you upload that infringes on third-party rights.

## 6. Prohibited Conduct

**Summary:** Don't use our services for anything illegal or harmful. Respect others and our platform.

You agree not to:

* Use the Services for unlawful purposes.

* Upload, share, or store content that is illegal, infringing, or violates any third-party rights.

* Attempt to access or use another user's account without permission.

* Interfere with the operation or security of the Services.

## 7. Data Storage and Liability

**Summary:** We store your data to provide the service, but we are not liable for data loss. We may remove content that violates these Terms or the law.

* We store your data to provide the Services. We are not liable for any loss of data, but we will take reasonable steps to protect your information.

* We may remove or disable access to content that violates these Terms or applicable law.

* We comply with applicable safe harbor provisions (such as the DMCA) and will respond to valid takedown requests.

## 8. Fair Use and Educational Use

**Summary:** Some content may be used under fair use, especially for education, but you are responsible for ensuring your use is legal.

* Some content may be used under fair use, especially for educational purposes. However, fair use is complex and not guaranteed. You are responsible for ensuring your use complies with the law.

## 9. Termination

**Summary:** We can suspend or terminate your access if you violate these Terms.

* We may suspend or terminate your access to the Services at our discretion, especially if you violate these Terms.

## 10. Changes to the Terms

**Summary:** We may update these Terms. We'll notify you of major changes. Continued use means you accept the new Terms.

* We may update these Terms from time to time. We will notify you of significant changes. Continued use of the Services after changes means you accept the new Terms.

## 11. Disclaimers and Limitation of Liability

**Summary:** The service is provided "as is." We are not liable for damages resulting from your use.

* The Services are provided "as is" without warranties of any kind.

* We are not liable for any indirect, incidental, or consequential damages arising from your use of the Services.

## 12. Privacy and User Information

**Summary:** We respect your privacy and keep your information confidential. See our Privacy Policy for details.

We respect your privacy and are committed to keeping your personal information confidential. We do not share your personal information with third parties except as necessary to provide the Services, comply with legal obligations, or protect our rights. We may disclose your information if required by law, regulation, legal process, or governmental request.

For more details on how we collect, use, and protect your information, please refer to our Privacy Policy.

## 13. Contact

**Summary:** Contact us if you have questions about these Terms.

If you have questions about these Terms, contact us at <support@dodatathings.dev>
`;

export default function TermsPage() {
  return (
    // Force dark theme for terms of service page regardless of user preference
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
                  {termsContent}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
        <footer className="py-12 bg-[color:var(--bg-color)] relative z-20">
          <div className="container mx-auto px-6 text-center text-sm text-[color:var(--primary-color)]/60">
            © {new Date().getFullYear()} dodatathings.dev. All rights reserved. 
            <Link href="/privacy" className="ml-4 hover:text-[color:var(--accent-color)]">Privacy Policy</Link>
          </div>
        </footer>
      </main>
    </div>
  );
} 