import { useCallback, useEffect, useState } from 'react';
import client from './client';

export default function useServerPage(path, filters = {}, countPath = null) {
  const key = JSON.stringify(filters);
  const [pagination, setPagination] = useState({ key, page: 0 });
  const page = pagination.key === key ? pagination.page : 0;
  const [version, setVersion] = useState(0);
  const [state, setState] = useState({ items: [], total: 0, loading: true, error: '', totals: {} });
  const reload = useCallback(() => setVersion(value => value + 1), []);
  const setPage = value => setPagination({ key, page: value });
  const setItems = update => setState(previous => ({ ...previous, items: typeof update === 'function' ? update(previous.items) : update }));
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setState(previous => ({ ...previous, loading: true, error: '' }));
      try {
        const params = JSON.parse(key);
        const [rows, counts] = await Promise.all([
          client.get(path, { params: { ...params, skip: page * 20, limit: 20 } }),
          countPath ? client.get(countPath, { params }) : Promise.resolve(null),
        ]);
        if (!cancelled) setState({ items: rows.data.items ?? rows.data, total: counts?.data.total ?? rows.data.total,
          totals: counts?.data ?? {}, loading: false, error: '' });
      } catch {
        if (!cancelled) setState(previous => ({ ...previous, loading: false, error: 'Could not load this page. Please retry.' }));
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [path, countPath, key, page, version]);
  return { ...state, page, setPage, setItems, reload };
}
