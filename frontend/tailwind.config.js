/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    // Dynamic alert-type badge colors used in LibAlerts.jsx
    'text-rose-500', 'bg-rose-100', 'bg-rose-500/15', 'text-rose-600', 'text-rose-400',
    'text-orange-500', 'bg-orange-100', 'bg-orange-500/15', 'text-orange-600', 'text-orange-400',
    'text-amber-500', 'bg-amber-100', 'bg-amber-500/15', 'text-amber-600', 'text-amber-400',
    'text-slate-500', 'bg-slate-100', 'bg-slate-500/15', 'text-slate-600', 'text-slate-400',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}