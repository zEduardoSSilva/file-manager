
import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster"
import { Inter, Source_Code_Pro } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const sourceCodePro = Source_Code_Pro({
  subsets: ['latin'],
  variable: '--font-code',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'File Manager Pilot | Precision Data Analysis',
  description: 'Data processing pipeline management for logistics operations',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${sourceCodePro.variable}`}>
      <body className="font-body antialiased bg-background">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
