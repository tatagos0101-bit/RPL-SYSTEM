import { registrationDeliveryNotice } from '../api/memberRegistration';

export default function RegistrationDelivery({ result }) {
  const notice = registrationDeliveryNotice(result);
  return <div className="space-y-2" role="status">
    <p className={`text-sm font-semibold ${notice.tone === 'success' ? 'text-success' : 'text-warning'}`}>{notice.title}</p>
    <p className="text-sm text-muted">{notice.message}</p>
    {notice.temporaryPassword && <div>
      <p className="mb-1 text-sm font-semibold tracking-normal text-muted">Temporary Password</p>
      <p className="select-all break-all font-sans text-base font-semibold text-ink">{notice.temporaryPassword}</p>
    </div>}
  </div>;
}
