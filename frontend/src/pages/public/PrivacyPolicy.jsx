import { useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function PrivacyPolicy() {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <main className="rpl-page rpl-public min-h-screen bg-canvas px-4 pt-[calc(var(--rpl-header-height)+2rem)] pb-10 text-ink sm:px-6 sm:pb-14">
      <article className="mx-auto max-w-3xl rounded-xl border border-line bg-panel p-6 sm:p-10">
        <Link to="/" className="text-sm font-semibold text-link underline underline-offset-4">Library home</Link>
        <header className="mt-6 border-b border-line pb-6">
          <p className="text-sm font-semibold text-link">Rizal Provincial Library</p>
          <h1 className="rpl-title mt-2">Data Privacy</h1>
          <p className="mt-4 leading-7 text-muted">Learn how this library system handles personal information and facial recognition, and where to ask for assistance.</p>
          <p className="mt-4 rounded-lg bg-subtle p-4 text-sm leading-6 text-muted">Information notice · Updated November 5, 2026. The library’s formal lawful basis, retention schedule, responsible organization and designated privacy contact still require confirmation. This page does not record consent or claim privacy certification.</p>
        </header>
        <div className="space-y-8 pt-8 text-base leading-7">
          <section aria-labelledby="privacy-information">
            <h2 id="privacy-information" className="rpl-section-title mb-3">Information the system handles</h2>
            <p>Account information includes your name, library member ID, contact details where supplied, location, account status and a hashed password. The system also handles identification documents supplied during registration, optional profile photos, borrowing and reservation records, attendance, and book interactions used for recommendations.</p>
          </section>
          <section aria-labelledby="privacy-face">
            <h2 id="privacy-face" className="rpl-section-title mb-3">Facial recognition and camera images</h2>
            <p>Enrollment captures a face image and creates a numerical facial template. Later camera images are compared with enrolled templates for identification during library transactions, face sign-in and entrance attendance. Templates can identify people; they are not anonymous information.</p>
            <p className="mt-3">Enrollment normally stores the template rather than a separate enrollment photograph. Suspected spoof attempts can store a facial snapshot, an event time, an IP address and an associated account when known. The entrance station processes camera frames while scanning is active, including faces it cannot match. Recognition can make mistakes; ask staff for assistance when it does.</p>
          </section>
          <section aria-labelledby="privacy-storage">
            <h2 id="privacy-storage" className="rpl-section-title mb-3">Storage and access</h2>
            <p>The project uses Supabase for its hosted database and uploaded files, and Vercel for website and API hosting. The library must confirm its formal provider arrangements. Library staff and authorized system administrators have access appropriate to their duties; patrons can access their own supported account information.</p>
            <p className="mt-3">Identification documents and profile photos use restricted file access. Book covers are public. The server checks permissions, hashes account passwords and requires protected connections in production. No security measure guarantees complete protection, and this notice does not claim ISO certification.</p>
          </section>
          <section aria-labelledby="privacy-choices">
            <h2 id="privacy-choices" className="rpl-section-title mb-3">Your choices and requests</h2>
            <p>Reading this page, signing in or allowing browser camera access does not record biometric consent. Password sign-in remains available. Ask library staff about supervised identification and assistance if you do not wish to use facial recognition.</p>
            <p className="mt-3">You can ask about your personal information and request access, correction, objection to processing, or deletion where applicable. Staff must verify identity and review requests against the library’s approved procedures and obligations. This page does not automatically delete records or submit a request.</p>
            <p className="mt-3">The library has not yet supplied an approved retention period for this notice. The application does not automatically purge biometric records on a schedule. Authorized staff can remove stored face data; account deletion is subject to outstanding loans and preserves deidentified transaction and attendance history.</p>
          </section>
          <section aria-labelledby="privacy-contact">
            <h2 id="privacy-contact" className="rpl-section-title mb-3">Contact the library</h2>
            <p>Visit the library desk at L. Wood Rd, Dolores, Taytay, Rizal, or use the library’s general contact details below. Ask staff to direct a privacy request to the responsible officer. These are general library contacts, not a confirmed Data Protection Officer contact.</p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li><a href="tel:026587276" className="text-link underline underline-offset-4">(02) 658-7276</a></li>
              <li><a href="mailto:provinciallibrary_rizal@yahoo.com" className="break-words text-link underline underline-offset-4">provinciallibrary_rizal@yahoo.com</a></li>
            </ul>
            <p className="mt-3">Do not send passwords, facial templates or identification documents through ordinary email. Ask staff for an approved way to provide any required information.</p>
            <p className="mt-3">For information about your rights under the Philippine Data Privacy Act, see the <a href="https://privacy.gov.ph/the-right-to-be-informed/" className="text-link underline underline-offset-4">National Privacy Commission’s guidance</a>.</p>
          </section>
        </div>
      </article>
    </main>
  );
}
