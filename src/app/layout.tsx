import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Inspector } from 'react-dev-inspector';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'TrackMaster AI Coach | 赛道级虚拟赛车教练',
  description:
    '基于时序遥测数据的弯道动态评价系统。上传赛车游戏 CSV 遥测数据，AI 自动切分弯道、评估驾驶表现并生成专业反馈。',
  keywords: [
    '赛车教练',
    '遥测数据分析',
    '弯道评价',
    '驾驶评分',
    'AI 赛车',
    'Assetto Corsa',
    'F1',
    '赛车模拟器',
  ],
  authors: [{ name: 'TrackMaster', url: 'https://code.coze.cn' }],
  generator: 'Coze Code',
  openGraph: {
    title: 'TrackMaster AI Coach | 赛道级虚拟赛车教练',
    description:
      '上传赛车遥测 CSV，AI 自动分析每个弯道的刹车、弯速、油门和走线表现。',
    url: 'https://code.coze.cn',
    siteName: 'TrackMaster AI Coach',
    locale: 'zh_CN',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.COZE_PROJECT_ENV === 'DEV';

  return (
    <html lang="zh-CN" className={`dark ${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="antialiased bg-[#06060a] text-[#e8e8ed] font-sans">
        {isDev && <Inspector />}
        {children}
      </body>
    </html>
  );
}
