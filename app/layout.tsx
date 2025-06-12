import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import ThemeHandler from '@/components/ThemeHandler';
import AppInitializer from '@/components/AppInitializer';
import './globals.css';
import { AuthStateListener } from '@/components/AuthStateListener';
import { Analytics } from '@vercel/analytics/next';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { Toaster } from 'sonner';


export const viewport: Viewport = {
  themeColor: "#0070f3",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://www.tuon.io"),
  title: "Tuon | Everything your notes app should be",
  description: "Tuon empowers you keep better notes. Upload and extract PDFs. Transcribe live audio. Save and summarize web pages. Track every version of your notes. All in one place.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "tuon.io",
    startupImage: "/icons/apple-touch-icon.png",
  },
  icons: {
    icon: ["/favicon.ico", { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
    apple: '/icons/apple-touch-icon.png',
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
    'apple-mobile-web-app-title': 'tuon.io'
  },
  // Twitter Meta Tags
  twitter: {
    card: "summary_large_image",
    site: "@DoDataThings",
    title: "Tuon | Everything your notes app should be",
    description: "Upload and extract PDFs. Transcribe live audio. Save and summarize web pages. Track every version of your notes. All in one place. Try Tuon for free.",
    images: [
      {
        url: "https://www.tuon.io/landing-page-2.png",
        width: 1200,
        height: 630,
        alt: "Tuon landing page hero image",
      },
    ],
  },
  // Open Graph Meta Tags
  openGraph: {
    title: "Tuon | Everything your notes app should be",
    description: "AI-powered document writing and versioning.",
    images: [
      {
        url: "https://www.tuon.io/landing-page-2.png",
        width: 1200,
        height: 630,
        alt: "Tuon landing page hero image",
      },
    ],
    url: "https://www.tuon.io",
    type: "website",
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                let theme = 'dark'; // Default to dark
                try {
                  // Optional: If you also want to respect a localStorage preference set by client-side toggling
                  // const storedTheme = localStorage.getItem('theme'); // Use the same key your theme toggle might use
                  // if (storedTheme) {
                  //   theme = storedTheme;
                  // }
                } catch (e) {
                  // localStorage may not be available (e.g., in some SSR or restricted environments)
                  console.warn('[AntiFlickerScript] localStorage not accessible.');
                }
                document.documentElement.setAttribute('data-theme', theme);
                console.log('[AntiFlickerScript] Initial theme set to:', theme);
              })();
            `,
          }}
        />
      </head>
      <body className={GeistSans.className}>
        <AuthStateListener>
          <ThemeHandler>
            <AppInitializer>
              <ErrorBoundary fallbackMessage="The application encountered an unexpected error. Please try refreshing the page.">
                {children}
              </ErrorBoundary>
            </AppInitializer>
          </ThemeHandler>
        </AuthStateListener>
        {/* Fallback toaster for basic notifications */}
        <Toaster position="top-right" offset="1rem" />
        <Analytics />
      </body>
    </html>
  );
}
