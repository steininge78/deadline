import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Deadline Lager',
  description: 'Lager og logistikk for Deadline',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  appleWebApp: { capable: true, title: 'Deadline Lager', statusBarStyle: 'black-translucent' }
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#1b252e' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nb">
      <head>
        {/* Adobe Fonts (Quador + FreightSans Pro). Domenet må være lagt til i Adobe Fonts-prosjektet. */}
        <link rel="stylesheet" href="https://use.typekit.net/xke0gxx.css" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,700;7..72,900&family=Source+Sans+3:wght@400;600;700&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
