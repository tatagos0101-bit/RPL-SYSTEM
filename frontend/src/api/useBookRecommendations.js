import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { getRecommendations } from './user';
import { favoriteBook, getFavorites, unfavoriteBook } from './bookInteractions';

export default function useBookRecommendations(modalOpen) {
  const [recs, setRecs] = useState([]);
  const [recLoading, setRecLoading] = useState(true);
  const [recError, setRecError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [favorites, setFavorites] = useState(new Set());
  const [favoritesLoading, setFavoritesLoading] = useState(true);
  const [favoritesError, setFavoritesError] = useState(false);
  const [favoriteRevision, setFavoriteRevision] = useState(0);
  const [pendingFavorites, setPendingFavorites] = useState(new Set());
  const pending = useRef(new Set());

  useEffect(() => {
    if (modalOpen) return;
    let active = true;
    getRecommendations(10).then(({ data }) => {
      if (active) { setRecs(data); setRecError(false); }
    }).catch(() => {
      if (active) setRecError(true);
    }).finally(() => {
      if (active) setRecLoading(false);
    });
    return () => { active = false; };
  }, [modalOpen, revision]);

  useEffect(() => {
    let active = true;
    getFavorites().then(({ data }) => {
      if (active) { setFavorites(new Set(data)); setFavoritesError(false); }
    }).catch(() => {
      if (active) setFavoritesError(true);
    }).finally(() => {
      if (active) setFavoritesLoading(false);
    });
    return () => { active = false; };
  }, [favoriteRevision]);

  const toggleFavorite = useCallback(async (bookId) => {
    if (favoritesLoading || favoritesError || pending.current.has(bookId)) return;
    pending.current.add(bookId);
    setPendingFavorites(new Set(pending.current));
    const wasFavorite = favorites.has(bookId);
    try {
      await (wasFavorite ? unfavoriteBook(bookId) : favoriteBook(bookId));
      setFavorites(previous => {
        const next = new Set(previous);
        if (wasFavorite) next.delete(bookId); else next.add(bookId);
        return next;
      });
      setRevision(value => value + 1);
    } catch {
      toast.error('Could not update your favorite. Please try again.', { position: 'bottom-right' });
    } finally {
      pending.current.delete(bookId);
      setPendingFavorites(new Set(pending.current));
    }
  }, [favorites, favoritesLoading, favoritesError]);

  return {
    recs, recLoading, recError, favorites, favoritesLoading, favoritesError, pendingFavorites,
    toggleFavorite,
    retryRecommendations: () => { setRecLoading(true); setRevision(value => value + 1); },
    retryFavorites: () => { setFavoritesLoading(true); setFavoriteRevision(value => value + 1); },
  };
}
