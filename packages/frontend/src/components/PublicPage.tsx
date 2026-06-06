import { ReactNode } from 'react';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';

export default function PublicPage({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-800">
      <SiteHeader />
      <main className="flex-1">
        <div className="bg-gradient-to-br from-indigo-600 to-purple-700 text-white">
          <div className="max-w-4xl mx-auto px-5 py-12">
            <h1 className="text-3xl font-bold">{title}</h1>
            {subtitle && <p className="text-indigo-100 mt-2">{subtitle}</p>}
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-5 py-10 text-slate-600 leading-relaxed space-y-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-800 [&_h2]:mt-6 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_a]:text-indigo-600">
          {children}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
