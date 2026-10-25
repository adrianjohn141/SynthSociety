import { Zen_Maru_Gothic } from 'next/font/google';
import './globals.css';

const font = Zen_Maru_Gothic({ weight: ['500', '700'], subsets: ['latin'], variable: '--font' });

export const metadata = { title: 'Synthetic Society', description: 'A cozy town of autonomous residents with jobs and relationships.' };

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={font.variable}>
      <body>{children}</body>
    </html>
  );
}
