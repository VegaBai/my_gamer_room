import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: "Vega's Gaming Room | Interactive 3D Room",
  description: 'Explore a pink-and-white gaming room. Click the devices to adjust them in 3D.',
  openGraph: {
    title: "Vega's Gaming Room | Interactive 3D Room",
    description: 'Explore a pink-and-white gaming room. Click the devices to adjust them in 3D.',
    type: 'website',
    locale: 'en_US',
    alternateLocale: ['zh_CN'],
    images: [{ url: '/og.png', width: 1600, height: 900, alt: 'Pink-and-white gaming room in 3D' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: "Vega's Gaming Room | Interactive 3D Room",
    description: 'Explore a pink-and-white gaming room. Click the devices to adjust them in 3D.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
