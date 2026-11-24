import { PRIVACY_NOTICE_VERSION } from '../api/privacyPolicy';

const noticeDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'Asia/Manila' })
  .format(new Date(PRIVACY_NOTICE_VERSION));

export default function PrivacyNoticeContent({ headingTag = 'h2' }) {
  const Heading = headingTag;
  return (
    <div className="space-y-6">
      <p className="text-sm font-medium text-muted">
        Rizal Provincial Library · Updated <time dateTime={PRIVACY_NOTICE_VERSION}>{noticeDate}</time>
      </p>
      <section>
        <Heading className="mb-2 font-semibold text-ink">Information used for library services</Heading>
        <p>The library uses your name, member ID, address, contact details where supplied, account status and a securely hashed password to manage your membership and sign-in. If you provide an optional identification document or profile photo, the library uses it to support identification or manage your profile.</p>
        <p className="mt-2">Borrowing, returns, reservations and attendance records support library services. Book interactions may be used to recommend titles to you. Visitors also record their visits in the library’s manual logbook.</p>
      </section>
      <section>
        <Heading className="mb-2 font-semibold text-ink">Email and account messages</Heading>
        <p>The library may use the email address you provide at registration to send your temporary sign-in details before your first sign-in. It may also use your address to verify your contact details, help you recover your account and send library service messages where email delivery is available. Some notices are available in your library account. You can register without supplying an email address.</p>
        <p className="mt-2">The library uses your address for these service messages. It does not use it for advertising or get access to your Gmail or other email account.</p>
      </section>
      <section>
        <Heading className="mb-2 font-semibold text-ink">Optional facial recognition</Heading>
        <p>If you choose to enroll, the library asks for separate consent before using the camera. Enrollment uses a live image to create a numerical facial template. The system uses that template to identify you for supported library services, including face sign-in, borrowing and returns, and entrance attendance. The template can identify you and must be protected as personal information.</p>
        <p className="mt-2">Enrollment generally saves the template. During camera checks, suspected attempts to impersonate someone can produce a saved facial image and related security information for authorized staff to review. The entrance station can process faces it cannot match while scanning is active.</p>
        <p className="mt-2">The library uses facial data for the library identification and related security purposes described here. Password sign-in is available, and staff can assist with supervised identification if you choose not to enroll or if a match fails.</p>
      </section>
      <section>
        <Heading className="mb-2 font-semibold text-ink">Storage and access</Heading>
        <p>Authorized library staff and system administrators have access as needed to do their work. The system uses Vercel for hosting, Supabase for the database and file storage, and an email provider to deliver messages. The library may disclose information when required by law.</p>
        <p className="mt-2">The system restricts access to identification documents and profile photos, stores passwords as hashes and checks permissions before allowing access to protected records.</p>
      </section>
      <section>
        <Heading className="mb-2 font-semibold text-ink">Your choices and privacy requests</Heading>
        <p>Ask library staff how long information is kept and how to request access, correction, deletion where applicable, or to raise an objection. Staff may verify your identity and review requests against the library’s procedures and obligations.</p>
        <p className="mt-2">If you no longer wish to use facial recognition, ask library staff to remove your stored template. The system does not automatically purge biometric records on a schedule. Account deletion is subject to outstanding loans, and the system can keep deidentified transaction and attendance history.</p>
      </section>
      <section>
        <Heading className="mb-2 font-semibold text-ink">Contact the library</Heading>
        <p>Visit the library desk at L. Wood Rd, Dolores, Taytay, Rizal, or ask staff to direct a privacy request to the responsible officer using the library’s general contact details.</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><a href="tel:026587276" className="text-link underline underline-offset-4">(02) 658-7276</a></li>
          <li><a href="mailto:provinciallibrary_rizal@yahoo.com" className="break-all text-link underline underline-offset-4">provinciallibrary_rizal@yahoo.com</a></li>
        </ul>
        <p className="mt-2">Keep your password private. Ask staff for an approved way to provide any required identification documents. For information about your privacy rights, see the <a href="https://privacy.gov.ph/the-right-to-be-informed/" className="text-link underline underline-offset-4">National Privacy Commission’s guidance</a>.</p>
      </section>
    </div>
  );
}
