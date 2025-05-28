import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import ThemeHandler from '@/components/ThemeHandler';
import AppInitializer from '@/components/AppInitializer';
import './globals.css';
import { Toaster } from "sonner";
import { AuthStateListener } from '@/components/AuthStateListener';

export const viewport: Viewport = {
  themeColor: "#0070f3",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "tuon.io",
  description: "Bring it all into focus",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "tuon.io",
    startupImage: "/icons/apple-touch-icon.png",
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }
    ]
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
    'apple-mobile-web-app-title': 'tuon.io'
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
              {children}
            </AppInitializer>
          </ThemeHandler>
        </AuthStateListener>
        <Toaster position="bottom-center" offset="4rem" />
      </body>
    </html>
  );
}
