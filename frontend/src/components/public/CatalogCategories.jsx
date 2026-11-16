import BookCover from '../BookCover';
import BookShelf from './BookShelf';

export default function CatalogCategories({ categories, activeCategory, onSelect, books = [], featured = false, headingLevel = 1 }) {
  const hasPreviews = categories.some(category => Array.isArray(category.preview_covers));
  const categoryCovers = categories.map(category => category.preview_covers || []);
  const allCovers = hasPreviews ? [...new Map([
    ...categoryCovers.map(covers => covers[0]).filter(Boolean), ...categoryCovers.flat(),
  ].map(book => [book.id, book])).values()].slice(0, 3) : undefined;
  const choices = [
    ...(featured ? [{ key: 'featured', value: null, label: 'Featured' }] : []),
    { key: 'all', value: '', label: 'All books', covers: allCovers },
    ...categories.map(({ category, preview_covers }) => ({ key: `genre:${category}`, value: category, label: category, covers: preview_covers })),
  ];
  return <BookShelf heading="Browse the stacks" headingLevel={headingLevel} label="Book categories" controlsLabel="categories" kind="categories">
    {choices.map(choice => {
      const previews = Array.isArray(choice.covers) ? choice.covers : books.filter(book => (!choice.value || book.category === choice.value) && (book.cover_url || book.cover)).slice(0, 3);
      return <button key={choice.key} type="button" onClick={() => onSelect(choice.value)} aria-pressed={activeCategory === choice.value}
        className={`catalog-category ${activeCategory === choice.value ? 'is-active' : ''}`}>
        <span className="catalog-category-covers" aria-hidden="true">
          {previews.length ? previews.map(book => <span key={book.id} className="catalog-mini-cover"><BookCover src={book.cover_url || book.cover} alt="" iconSize={14} /></span>)
            : <span className="catalog-neutral-books"><i /><i /><i /></span>}
        </span>
        <span>{choice.label}</span>
      </button>;
    })}
  </BookShelf>;
}
