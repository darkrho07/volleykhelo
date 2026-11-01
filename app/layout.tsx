import type { Metadata, Viewport } from 'next';
import { Outfit, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['600', '700', '800', '900'],
  variable: '--font-display',
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-mono',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'Volley Khelo — Real-Time 3D Multiplayer Volleyball',
  description:
    'Play fast-paced 1v1, 2v2, and 3v3 3D beach volleyball in your browser with server-authoritative physics, spikes, sets, and live rooms.',
  openGraph: {
    title: 'Volley Khelo — Real-Time 3D Multiplayer Volleyball',
    description:
      'Play fast-paced 1v1, 2v2, and 3v3 3D beach volleyball in your browser with server-authoritative physics, spikes, sets, and live rooms.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Volley Khelo — Real-Time 3D Multiplayer Volleyball',
    description:
      'Play fast-paced 1v1, 2v2, and 3v3 3D beach volleyball in your browser with server-authoritative physics, spikes, sets, and live rooms.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${plusJakarta.variable} ${jetbrainsMono.variable} dark`}
    >
      <body suppressHydrationWarning className="w-screen h-dvh overflow-hidden bg-[#0b132b] text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
