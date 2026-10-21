import { useCallback, useEffect, useRef, useState } from 'react';
import { getBorrowingCapacity } from './reservations';

export default function useBorrowingCapacity(memberId) {
  const [capacity, setCapacity] = useState(null);
  const [capacityError, setCapacityError] = useState('');
  const requestVersion = useRef(0);
  const refreshCapacity = useCallback(async () => {
    const version = ++requestVersion.current;
    setCapacity(null); setCapacityError('');
    if (memberId === null) return;
    try {
      const { data } = await getBorrowingCapacity(memberId);
      if (version === requestVersion.current) setCapacity(data);
    } catch {
      if (version === requestVersion.current) setCapacityError('Could not check your five-book allowance. Please retry.');
    }
  }, [memberId]);
  useEffect(() => {
    const timer = setTimeout(refreshCapacity, 0);
    return () => { clearTimeout(timer); requestVersion.current += 1; };
  }, [refreshCapacity]);
  return { capacity, capacityError, refreshCapacity };
}
