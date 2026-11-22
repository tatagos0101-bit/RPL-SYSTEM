import { useEffect } from 'react';

// One observer for reveals, one for the background. No scroll-driven React renders.
export default function useLandingMotion(pageRef) {
  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reveals;
    let background;
    let heroVisible = true;

    const updatePlayback = () => {
      page.classList.toggle('discovery-ambient-paused', document.hidden || !heroVisible || preference.matches);
    };
    const configure = () => {
      reveals?.disconnect();
      background?.disconnect();
      page.classList.remove('discovery-motion-ready');
      updatePlayback();
      if (preference.matches || !('IntersectionObserver' in window)) return;

      reveals = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-revealed');
          reveals.unobserve(entry.target);
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -36px 0px' });
      page.classList.add('discovery-motion-ready');
      page.querySelectorAll('.discovery-reveal:not(.is-revealed)').forEach(node => reveals.observe(node));

      background = new IntersectionObserver(([entry]) => {
        heroVisible = entry.isIntersecting;
        updatePlayback();
      });
      const hero = page.querySelector('.discovery-hero');
      if (hero) background.observe(hero);
    };

    configure();
    preference.addEventListener('change', configure);
    document.addEventListener('visibilitychange', updatePlayback);
    return () => {
      reveals?.disconnect();
      background?.disconnect();
      preference.removeEventListener('change', configure);
      document.removeEventListener('visibilitychange', updatePlayback);
      page.classList.remove('discovery-motion-ready', 'discovery-ambient-paused');
    };
  }, [pageRef]);
}
