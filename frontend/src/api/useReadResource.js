import { useEffect, useState } from 'react';

export default function useReadResource(fetchResource) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ data: null, loading: true, error: false });
  useEffect(() => {
    let cancelled = false;
    fetchResource().then(({ data }) => {
      if (!cancelled) setState({ data, loading: false, error: false });
    }).catch(() => {
      if (!cancelled) setState(previous => ({ ...previous, loading: false, error: true }));
    });
    return () => { cancelled = true; };
  }, [fetchResource, attempt]);
  const retry = () => {
    setState(previous => ({ ...previous, loading: true, error: false }));
    setAttempt(value => value + 1);
  };
  return { ...state, retry };
}
