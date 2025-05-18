import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import ThemeHandler from '@/components/ThemeHandler';
import AppInitializer from '@/components/AppInitializer';
import './globals.css';
import { Toaster } from "sonner";

const inter = Inter({ subsets: ['latin'] });

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
      <body className={inter.className}>
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
