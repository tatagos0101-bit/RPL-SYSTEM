import BookCover from '../BookCover';
import SearchHighlight from './SearchHighlight';

export default function MemberCatalogCard({ book, query = '', onSelect, onAdd, onCancel, isInCart, isReserved, favorite, badge }) {
  const available = (book.copies_available ?? 0) > 0;
  return <article className="catalog-book catalog-member-book">
    <div className="catalog-member-cover">
      <button type="button" className="catalog-book-cover" onClick={onSelect} aria-label={`View details for ${book.title}`}>
        <BookCover src={book.cover_url || book.cover} alt={book.title} className="catalog-cover-image" iconSize={28} />
      </button>
      <div className="catalog-member-cover-tools">
        {badge ? <span className="catalog-member-badge" title={badge.label}>{badge.label}</span> : <span />}
        {favorite}
      </div>
    </div>
    <button type="button" onClick={onSelect} className="catalog-book-title"><SearchHighlight text={book.title} query={query} /></button>
    <p className="catalog-book-author"><SearchHighlight text={book.author || 'Unknown Author'} query={query} /></p>
    <p className="catalog-book-availability">{book.availability_status || (available ? 'Available' : 'Not available')}</p>
    {isReserved ? <button type="button" onClick={onCancel} className="catalog-book-action catalog-member-cancel">Cancel reservation</button>
      : <button type="button" onClick={onAdd} disabled={isInCart || book.is_borrowable === false} className="catalog-book-action catalog-member-reserve">
        {book.is_borrowable === false ? 'Library use only' : isInCart ? 'In selection' : available ? 'Reserve' : 'Join queue'}
      </button>}
  </article>;
}
