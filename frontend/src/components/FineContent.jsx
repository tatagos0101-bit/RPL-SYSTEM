import { SHOW_FINES } from '../api/fineVisibility';

// Keep the original fine UI in source without rendering it in either portal.
export default function FineContent({ children }) {
  return SHOW_FINES ? children : null;
}
