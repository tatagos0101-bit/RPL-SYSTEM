import BookCover from '../BookCover';
import SearchHighlight from './SearchHighlight';

export default function CatalogBookCard({ book, onClick, query = '' }) {
  const title = book.title || book.name;
  return (
    <button type="button" className="catalog-book catalog-public-book" aria-label={`View details for ${title}`} onClick={onClick}>
      <span className="catalog-book-cover">
        <BookCover src={book.cover_url || book.cover} alt={title} className="catalog-cover-image" iconSize={28} />
      </span>
      <span className="catalog-book-title"><SearchHighlight text={title} query={query} /></span>
      <span className="catalog-book-author"><SearchHighlight text={book.author || 'Unknown Author'} query={query} /></span>
      <span className="catalog-book-availability">{book.availability_status || ((book.copies_available ?? 0) > 0 ? 'Available' : 'Not available')}</span>
      <span className="catalog-book-action">View details</span>
    </button>
  );
}
