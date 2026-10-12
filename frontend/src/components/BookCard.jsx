const BookCard = ({ book, onClick }) => {
  return (
    <div
      className="w-full min-w-0 [overflow-wrap:anywhere] group cursor-pointer flex flex-col"
      onClick={onClick}
    >
      {/* Cover */}
      <div className={`relative aspect-[2/3] rounded-2xl overflow-hidden mb-3 shadow-md group-hover:shadow-xl group-hover:shadow-blue-200 dark:group-hover:shadow-blue-900/40 transition-all duration-300 group-hover:-translate-y-1.5 ring-1 ring-black/10 dark:ring-white/5 ${
        book.available === false ? 'opacity-60' : ''
      }`}>
        <img
          src={book.cover || book.cover_url || 'https://via.placeholder.com/300x400?text=No+Cover'}
          alt={book.name || book.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Category badge */}
        <div className={`absolute top-2 left-2 ${book.available === false ? 'right-10' : 'right-2'}`}>
          <span className="inline-block max-w-full px-2 py-1 bg-blue-600/90 backdrop-blur-sm rounded-lg text-[8px] font-black text-white uppercase tracking-wider shadow-sm">
            {book.category || 'General'}
          </span>
        </div>

        {/* Unavailable badge */}
        {book.available === false && (
          <div className="absolute top-2 right-2">
            <span className="px-2 py-1 bg-rose-600/90 rounded-lg text-[8px] font-black text-white uppercase tracking-wider">
              Out
            </span>
          </div>
        )}

        {/* "View" label on hover */}
        <div className="absolute bottom-3 left-0 right-0 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <span className="px-3 py-1.5 bg-white/20 backdrop-blur-sm rounded-full text-[9px] font-black text-white uppercase tracking-widest">
            View Details
          </span>
        </div>
      </div>

      {/* Text */}
      <h4 className="font-bold text-slate-900 dark:text-white text-xs leading-snug line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors tracking-tight">
        {book.name || book.title}
      </h4>
      <p className="text-[10px] text-slate-500 font-medium mt-0.5 truncate">
        {book.author || 'Unknown Author'}
      </p>
    </div>
  );
};

export default BookCard;
