import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Mundo',
};

export default function WorldLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
