import { useState } from 'react';
import { assetUrl } from '../api/urls';

export default function UserAvatar({ url, name = 'Member', size = 40 }) {
  const [failedSource, setFailedSource] = useState(null);
  const source = assetUrl(url);
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map(word => word[0].toUpperCase()).join('');
  return (
    <span style={{ width: size, height: size }} className="inline-flex shrink-0 overflow-hidden rounded-xl bg-action items-center justify-center text-white font-semibold">
      {source && source !== failedSource
        ? <img src={source} alt={`${name}'s profile photo`} width={size} height={size}
            className="block h-full w-full object-cover" onError={() => setFailedSource(source)} />
        : <span aria-label={`${name}'s profile photo placeholder`} className={size > 40 ? 'text-2xl' : 'text-sm'}>{initials || 'M'}</span>}
    </span>
  );
}
