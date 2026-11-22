import { useCallback, useEffect, useRef, useState } from 'react';
import client from './client';

export default function useServerPage(path, filters = {}, countPath = null, pageSize = 20) {
  const key = JSON.stringify(filters);
  const [pagination, setPagination] = useState({ key, page: 0 });
  const page = pagination.key === key ? pagination.page : 0;
  const [version, setVersion] = useState(0);
  const previousSearch = useRef(filters.search);
  const [state, setState] = useState({ items: [], total: 0, loading: true, error: '', totals: {} });
  const reload = useCallback(() => setVersion(value => value + 1), []);
  const setPage = value => setPagination({ key, page: value });
  const setItems = update => setState(previous => ({ ...previous, items: typeof update === 'function' ? update(previous.items) : update }));
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const params = JSON.parse(key);
    const delay = previousSearch.current === params.search ? 0 : 200;
    previousSearch.current = params.search;
    const timer = setTimeout(async () => {
      setState(previous => ({ ...previous, loading: true, error: '' }));
      try {
        const [rows, counts] = await Promise.all([
          client.get(path, { params: { ...params, skip: page * pageSize, limit: pageSize }, signal: controller.signal }),
          countPath ? client.get(countPath, { params, signal: controller.signal }) : Promise.resolve(null),
        ]);
        if (!cancelled) {
          const total = counts?.data.total ?? rows.data.total;
          const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
          if (page > lastPage) {
            setPagination({ key, page: lastPage });
          } else {
            setState({ items: rows.data.items ?? rows.data, total,
              totals: counts?.data ?? {}, loading: false, error: '' });
          }
        }
      } catch {
        if (!cancelled) setState(previous => ({ ...previous, loading: false, error: 'Could not load this page. Please retry.' }));
      }
    }, delay);
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
  }, [path, countPath, key, page, pageSize, version]);
  return { ...state, page, pageSize, setPage, setItems, reload };
}
