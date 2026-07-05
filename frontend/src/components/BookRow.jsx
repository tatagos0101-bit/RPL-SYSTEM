import React from 'react';

const BookRow = ({ title, books }) => {
  return (
    <div className="py-8 px-6 md:px-12">
      <h3 className="text-2xl font-black italic uppercase tracking-tighter mb-6 flex items-center gap-3">
        <span className="w-2 h-8 bg-blue-600 rounded-full"></span>
        {title}
      </h3>
      <div className="flex gap-6 overflow-x-auto no-scrollbar pb-4">
        {books.map((book, index) => (
          <div key={index} className="flex-none w-[180px] group cursor-pointer">
            <div className="relative aspect-[2/3] rounded-xl overflow-hidden mb-3 border border-white/10 transition-transform duration-300 group-hover:scale-105 group-hover:border-blue-500/50">
              <img src={book.cover} alt={book.name} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                <button className="w-full py-2 bg-blue-600 text-xs font-bold rounded uppercase">View Details</button>
              </div>
            </div>
            <h4 className="font-bold text-sm truncate">{book.name}</h4>
            <p className="text-gray-500 text-xs uppercase font-bold tracking-widest">{book.category}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BookRow;