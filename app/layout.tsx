import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '我的电竞房间｜Interactive 3D Room',
  description: '一个可环绕、可点击的粉白科幻电竞房间。',
  openGraph: {
    title: '我的电竞房间｜Interactive 3D Room',
    description: '一个可环绕、可点击的粉白科幻电竞房间。',
    type: 'website',
    locale: 'zh_CN',
    images: [{ url: '/og.png', width: 1600, height: 900, alt: '粉白电竞房间 3D 场景' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '我的电竞房间｜Interactive 3D Room',
    description: '一个可环绕、可点击的粉白科幻电竞房间。',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
