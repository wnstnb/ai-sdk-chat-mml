import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import ThemeHandler from '@/components/ThemeHandler';
import './globals.css';
import { Toaster } from "sonner";

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: "AI SDK Chat MML",
  description: "AI SDK Chat MML",
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
          {children}
        </ThemeHandler>
        <Toaster position="bottom-center" offset="4rem" />
      </body>
    </html>
  );
}
