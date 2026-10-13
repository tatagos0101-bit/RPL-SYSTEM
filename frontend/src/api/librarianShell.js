export const getLibrarianShellClasses = (sidebarOpen) => ({
  nav: 'sticky top-0 z-40 w-full bg-white/80 dark:bg-slate-950/90 backdrop-blur-xl border-b border-slate-200 dark:border-white/5 px-4 sm:px-6 py-3 flex items-center justify-between flex-shrink-0 transition-colors duration-300',
  hamburger: 'p-2 rounded-xl text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-all',
  overlay: `fixed inset-0 z-50 bg-slate-950/35 dark:bg-black/65 backdrop-blur-sm transition-opacity duration-300 ${
    sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
  }`,
  sidebar: `fixed top-0 left-0 h-full w-72 z-[60] transform transition-transform duration-300 ease-out ${
    sidebarOpen ? 'translate-x-0' : '-translate-x-full'
  }`,
  main: 'min-w-0 flex-1 [overflow-wrap:anywhere]',
});

