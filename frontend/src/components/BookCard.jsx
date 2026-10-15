import BookCover from './BookCover';

const BookCard = ({ book, onClick }) => {
  return (
    <button
      type="button"
      aria-label={`View details for ${book.name || book.title}`}
      className="rpl-book w-full min-w-0 [overflow-wrap:anywhere] group cursor-pointer flex flex-col"
      onClick={onClick}
    >
      {/* Cover */}
      <div className={`rpl-book-cover w-full relative aspect-[2/3] overflow-hidden mb-3 bg-subtle shadow-sm transition-all duration-300 ring-1 ring-black/10 ring-line ${
        book.available === false ? 'opacity-60' : ''
      }`}>
        <BookCover
          src={book.cover || book.cover_url}
          alt={book.name || book.title}
          iconSize={32}
          className="w-full h-full object-cover transition-transform duration-500"
        />
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Category badge */}
        <div className={`absolute top-2 left-2 ${book.available === false ? 'right-10' : 'right-2'}`}>
          <span className="inline-block max-w-full px-2 py-1 bg-info-soft rounded-lg text-sm font-semibold text-link tracking-normal shadow-sm">
            {book.category || 'General'}
          </span>
        </div>

        {/* Unavailable badge */}
        {book.available === false && (
          <div className="absolute top-2 right-2">
            <span className="px-2 py-1 bg-danger-soft rounded-lg text-sm font-semibold text-danger tracking-normal">
              Out
            </span>
          </div>
        )}

        {/* "View" label on hover */}
        <div className="absolute bottom-3 left-0 right-0 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <span className="px-3 py-1.5 bg-panel rounded-full text-sm font-semibold text-ink tracking-normal">
            View Details
          </span>
        </div>
      </div>

      {/* Text */}
      <span className="font-semibold text-ink text-sm leading-snug line-clamp-2 group-hover:text-link transition-colors">
        {book.name || book.title}
      </span>
      <span className="max-w-full text-sm text-muted mt-1 truncate">
        {book.author || 'Unknown Author'}
      </span>
    </button>
  );
};

export default BookCard;
