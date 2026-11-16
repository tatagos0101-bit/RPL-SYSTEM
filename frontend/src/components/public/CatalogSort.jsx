import { ChevronDown } from 'lucide-react';

export default function CatalogSort({ value, onChange }) {
  return <label className="catalog-sort">
    <span className="sr-only">Sort books by</span>
    <select value={value} onChange={event => onChange(event.target.value)}>
      <optgroup label="Sort by">
        <option value="trending">Trending</option>
        <option value="newest">Newest</option>
        <option value="loved">Most loved</option>
        <option value="title">Title: A to Z</option>
      </optgroup>
    </select>
    <ChevronDown size={16} aria-hidden="true" />
  </label>;
}
