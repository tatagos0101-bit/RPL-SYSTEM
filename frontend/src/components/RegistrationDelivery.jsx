import { registrationDeliveryNotice } from '../api/memberRegistration';
import { downloadReport } from '../api/reporting';

export default function RegistrationDelivery({ result }) {
  const notice = registrationDeliveryNotice(result);
  return <div className="space-y-2" role="status">
    <p className={`text-sm font-semibold ${notice.tone === 'success' ? 'text-success' : 'text-warning'}`}>{notice.title}</p>
    <p className="text-sm text-muted">{notice.message}</p>
    {result.member_id && <button type="button" className="mt-3 rounded-lg border border-line px-4 py-2.5 text-sm font-semibold text-link hover:bg-subtle" onClick={() => downloadReport(new Blob([`Rizal Provincial Library\nRegistration receipt\n\nName: ${result.name}\nMember ID: ${result.member_id}\nAccount created by a librarian.\n\nUse your separately provided temporary password within 24 hours. Change it at first sign-in and read the privacy notice. Keep credentials private.\n`], { type: 'text/plain;charset=utf-8' }), 'RPL-Registration-Receipt.txt')}>Save registration receipt</button>}
    {notice.temporaryPassword && <div>
      <p className="mb-1 text-sm font-semibold tracking-normal text-muted">Temporary Password</p>
      <p className="select-all break-all font-sans text-base font-semibold text-ink">{notice.temporaryPassword}</p>
    </div>}
  </div>;
}
