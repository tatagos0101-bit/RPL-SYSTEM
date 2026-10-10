import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { assetUrl } from '../api/urls';

/**
 * Displays a book cover image with automatic fallback to an icon
 * when the URL is missing or the image fails to load (e.g. broken/404 URL).
 *
 * Relative paths (e.g. /uploads/covers/...) are resolved against the backend
 * API URL so they work in production where no dev-server proxy exists.
 */
const BookCover = ({ src, alt = '', className = 'w-full h-full object-cover', iconSize = 14 }) => {
  const [failed, setFailed] = useState(false);

  // Resolve backend-relative paths to an absolute URL
  const resolvedSrc = assetUrl(src);

  if (!resolvedSrc || failed) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <BookOpen size={iconSize} className="text-slate-400" />
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
};

export default BookCover;
