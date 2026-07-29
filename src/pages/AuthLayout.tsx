import type { ReactNode } from 'react';

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#f9f2ff] via-[#f2e9ff] to-[#fff3ea] p-4 text-violet-950">
      <div className="pointer-events-none absolute -left-24 top-[-5rem] h-80 w-80 rounded-full bg-fuchsia-300/45 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -right-20 h-96 w-96 rounded-full bg-violet-300/45 blur-3xl" />
      <div className="pointer-events-none absolute left-[16%] top-[48%] h-36 w-36 rounded-full bg-orange-200/55 blur-3xl" />
      <section className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-white/80 bg-white/55 p-6 shadow-[0_24px_80px_rgba(112,66,174,0.18)] backdrop-blur-2xl sm:p-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
        <div className="inline-flex rounded-full border border-violet-200/80 bg-violet-100/70 px-3 py-1 text-xs font-extrabold tracking-[0.18em] text-violet-700">LEARNPATH</div>
        <h1 className="mt-5 text-3xl font-bold tracking-tight text-violet-950">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-violet-800/70">{subtitle}</p>
        {children}
      </section>
    </main>
  );
}

export const labelClass = 'block text-sm font-medium text-violet-950';
export const inputClass = 'mt-1 w-full rounded-xl border border-violet-200/80 bg-white/65 px-3 py-3 text-sm text-violet-950 shadow-sm outline-none transition placeholder:text-violet-400/70 hover:border-violet-300 focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-300/25';
export const buttonClass = 'mt-5 w-full rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-violet-300/45 transition hover:-translate-y-0.5 hover:brightness-105 focus:outline-none focus:ring-4 focus:ring-violet-300/50 disabled:cursor-not-allowed disabled:opacity-60';
/** Shared style for secondary text-only navigation links (Forgot password, Back to sign in, etc.).
 *  min-h-[44px] satisfies the WCAG 2.5.5 minimum touch target size.
 *  underline decoration provides a visual affordance beyond colour alone.
 */
export const authLinkClass = 'inline-flex items-center min-h-[44px] px-1 text-sm font-medium text-violet-700 underline underline-offset-2 decoration-violet-300 hover:text-fuchsia-600 hover:decoration-fuchsia-400 focus:outline-none focus:ring-2 focus:ring-violet-400/50 rounded transition-colors';
