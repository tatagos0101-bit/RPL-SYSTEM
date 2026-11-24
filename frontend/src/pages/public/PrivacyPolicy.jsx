import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import PrivacyNoticeContent from '../../components/PrivacyNoticeContent';

export default function PrivacyPolicy() {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <main className="rpl-page rpl-public min-h-screen bg-canvas px-4 pt-[calc(var(--rpl-header-height)+2rem)] pb-10 text-ink sm:px-6 sm:pb-14">
      <article className="mx-auto max-w-3xl rounded-xl border border-line bg-panel p-6 sm:p-10">
        <Link to="/" className="text-sm font-semibold text-link underline underline-offset-4">Library home</Link>
        <header className="mt-6 border-b border-line pb-6">
          <h1 className="rpl-title">Library Privacy Notice</h1>
          <p className="mt-4 leading-7 text-muted">Learn how Rizal Provincial Library handles your information and where to ask for assistance.</p>
        </header>
        <div className="pt-8 text-base leading-7">
          <PrivacyNoticeContent />
        </div>
      </article>
    </main>
  );
}
