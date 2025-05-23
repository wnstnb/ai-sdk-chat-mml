import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import ThemeHandler from '@/components/ThemeHandler';
import AppInitializer from '@/components/AppInitializer';
import './globals.css';
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "tuon.io",
  description: "Bring it all into focus.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Immediately apply dark theme to prevent flash
              if (typeof window !== 'undefined') {
                document.documentElement.setAttribute('data-theme', 'dark');
              }
            `,
          }}
        />
      </head>
      <body className={GeistSans.className}>
        <ThemeHandler>
          <AppInitializer>
            {children}
          </AppInitializer>
        </ThemeHandler>
        <Toaster position="bottom-center" offset="4rem" />
      </body>
    </html>
  );
}
