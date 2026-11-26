import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getLoanPolicy } from '../api/books';

export default function BorrowingTerms() {
  const [policy, setPolicy] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let current = true;
    getLoanPolicy().then(({ data }) => { if (current) setPolicy(data); }).catch(() => { if (current) setError(true); });
    return () => { current = false; };
  }, []);
  return <section className="space-y-3 text-sm leading-relaxed text-muted" aria-label="Borrower terms and conditions">
    <h2 className="text-xl font-semibold text-ink">Borrower terms and conditions</h2>
    <p>Only titles marked for borrowing can leave the library. Reference and library-use-only items remain available for reading at the library.</p>
    <p>{policy ? `The loan period is ${policy.loan_days} days, and the system assigns the due date when the librarian confirms borrowing. Up to ${policy.commitment_limit} combined loans and reservations are allowed. Ready reservations must be collected within ${policy.pickup_window_hours} hours.` : 'The system assigns a due date when borrowing is confirmed. Follow the due date shown on your loan record and the pickup deadline shown on a ready reservation.'}</p>
    <p>{policy ? `Late returns are assessed at PHP ${Number(policy.fine_per_day).toFixed(2)} for each completed day after the due time.` : 'The library’s configured daily late fee applies to overdue books.'} Return overdue books before borrowing or reserving more titles.</p>
    {error && <p role="status">The current fee rate could not be loaded. Confirm it with the library desk before borrowing.</p>}
    <p>Keep each copy safe and report damage or loss promptly. A librarian inspects returns and records the condition. Damage and loss charges are assessed by the librarian; there is no automatic fixed replacement charge. You may ask the desk to explain or review an assessment. A recorded assessment does not mean a payment has been collected.</p>
    <p>Overdue, damaged and lost-book records are available for librarian review. Librarians may issue a warning, suspend an account or blacklist borrowing access, and may reactivate it after review. The system does not impose automatic suspension or blacklisting based on a fixed number of violations.</p>
    <p>Remote applications need librarian approval. Your submitted name is reviewed by the librarian. After approval, use the temporary password within 24 hours and set a new password of 8–128 characters with at least one digit. If email delivery is unavailable, collect your credentials from the library desk.</p>
    <p>Read the <Link to="/privacy-policy" target="_blank" rel="noopener noreferrer" className="font-semibold text-link underline underline-offset-4">Library Privacy Notice</Link> for account information, email messages and optional facial-recognition choices. Applying does not enroll your face.</p>
    <p>After the librarian verifies your original photo ID and issues your account, you may enroll your face online during account setup or later from Profile. Online enrollment requires separate consent, a live camera capture and matching against the ID kept by the library. You can continue using a password without enrolling your face.</p>
    <p className="text-xs">Terms version: 2026-11-26. The due date and assessed charges on each confirmed loan remain the record to review with the library.</p>
  </section>;
}
