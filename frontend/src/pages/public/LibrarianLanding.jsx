import { Link, useLocation } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';
import { PUBLIC_LIBRARIAN_NAV_LINKS } from '../../api/librarianNavigation';

const NAV_ICONS = {
  home: <ShieldCheck size={18} />,
  catalog: <BookOpen size={18} />,
};

export default function LibrarianLanding() {
  const location = useLocation();

  return (
    <main className="min-h-screen [overflow-wrap:anywhere] bg-slate-950 text-white overflow-hidden lg:flex">
      <aside className="relative z-20 w-full border-b border-white/10 bg-slate-950/95 px-5 py-4 lg:fixed lg:inset-y-0 lg:left-0 lg:w-72 lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
        <Link to="/librarian" className="group flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl border border-blue-400/30 bg-white/10 p-1.5 overflow-hidden">
            <img
              src="/logo.library.png"
              alt="Rizal Provincial Library"
              className="h-full w-full object-contain transition-transform duration-500 group-hover:rotate-[20deg] group-hover:scale-110"
            />
          </div>
          <div className="leading-none">
            <p className="font-black italic uppercase tracking-tighter text-white text-lg leading-none">
              Rizal <span className="text-blue-400">Lib</span>
            </p>
            <p className="mt-1 text-[8px] font-black uppercase tracking-widest text-blue-300/70">
              Librarian Portal
            </p>
          </div>
        </Link>

        <nav className="mt-6 grid gap-2 sm:grid-cols-2 lg:mt-10 lg:block lg:space-y-2">
          {PUBLIC_LIBRARIAN_NAV_LINKS.map((link) => {
            const active = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`group flex items-center gap-3 rounded-2xl px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${
                  active
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-950/50'
                    : 'text-slate-400 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className={active ? 'text-white' : 'text-blue-300'}>
                  {NAV_ICONS[link.key]}
                </span>
                <span className="flex-1">{link.label}</span>
                <ChevronRight
                  size={12}
                  className={`transition-transform ${active ? 'translate-x-0 opacity-100' : '-translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-60'}`}
                />
              </Link>
            );
          })}
        </nav>

        <div className="mt-6 rounded-3xl border border-blue-400/20 bg-blue-500/10 p-4 lg:absolute lg:bottom-6 lg:left-5 lg:right-5">
          <div className="mb-3 flex items-center gap-2 text-blue-300">
            <LockKeyhole size={15} />
            <p className="text-[10px] font-black uppercase tracking-widest">Staff Access</p>
          </div>
          <p className="text-xs font-medium leading-5 text-slate-400">
            Staff tools stay locked until a librarian signs in.
          </p>
          <Link
            to="/librarian/login"
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-500 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-blue-400 active:scale-[0.98]"
          >
            Sign In
            <ArrowRight size={14} />
          </Link>
        </div>
      </aside>

      <section className="relative min-w-0 min-h-[calc(100vh-120px)] flex items-center px-6 py-14 sm:px-10 lg:ml-72 lg:min-h-screen lg:flex-1 lg:px-10 xl:px-16 lg:py-20">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-40 right-0 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl" />
          <div className="absolute bottom-0 left-10 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/50 to-transparent" />
        </div>

        <div className="relative z-10 mx-auto grid w-full min-w-0 max-w-6xl grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] xl:items-center">
          <div className="min-w-0">
            <div className="mb-8 flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-blue-400/30 bg-blue-500/10 text-blue-300">
                <ShieldCheck size={28} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.3em] text-blue-300">
                  Authorized Personnel Only
                </p>
                <p className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-600">
                  Staff Operations Portal
                </p>
              </div>
            </div>

            <h1 className="max-w-3xl text-[clamp(2.25rem,10vw,3rem)] font-black uppercase italic leading-[1] tracking-tighter text-white sm:text-6xl 2xl:text-7xl">
              Librarian Command Center
            </h1>
            <p className="mt-6 max-w-xl text-base font-medium leading-8 text-slate-400">
              Sign in to access circulation, member records, reservations, inventory, reports, and daily library operations.
            </p>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                to="/librarian/login"
                className="inline-flex items-center justify-center gap-3 rounded-2xl bg-blue-500 px-6 py-4 text-xs font-black uppercase tracking-[0.25em] text-white shadow-xl shadow-blue-950/60 transition-all hover:-translate-y-0.5 hover:bg-blue-400"
              >
                Librarian Sign In
                <ArrowRight size={16} />
              </Link>
              <Link
                to="/browse"
                className="inline-flex items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-4 text-xs font-black uppercase tracking-[0.25em] text-slate-300 transition-all hover:-translate-y-0.5 hover:border-blue-400/40 hover:text-white"
              >
                Public Catalog
              </Link>
            </div>
          </div>

          <div className="min-w-0 rounded-[2rem] border border-white/10 bg-white/[0.03] p-4 sm:p-5 shadow-2xl shadow-black/40 backdrop-blur">
            <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/90 p-4 sm:p-6">
              <div className="mb-6 flex flex-col items-start gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-center">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-300">
                  <LockKeyhole size={22} />
                </div>
                <div>
                  <p className="text-sm font-black uppercase tracking-widest text-white">
                    Protected Staff Area
                  </p>
                  <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
                    Staff-only tools are intentionally hidden until sign-in.
                  </p>
                </div>
              </div>

              <div className="grid gap-3">
                {PUBLIC_LIBRARIAN_NAV_LINKS.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className="group rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:border-blue-400/40 hover:bg-blue-500/10"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-300 transition-colors group-hover:bg-blue-500 group-hover:text-white">
                        {NAV_ICONS[link.key]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="text-sm font-black uppercase tracking-widest text-white">
                          {link.label}
                        </h2>
                      </div>
                      <ChevronRight size={14} className="text-slate-600 transition-transform group-hover:translate-x-1 group-hover:text-blue-300" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
