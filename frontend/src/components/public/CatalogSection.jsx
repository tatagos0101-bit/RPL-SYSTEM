import { RefreshCw } from 'lucide-react';
import BookShelf from './BookShelf';

export default function CatalogSection({ id, heading, description, loading, error, onRetry, onSeeAll, emptyMessage, children, hasBooks }) {
  return <div id={id} className="catalog-featured-section">
    <BookShelf horizontal heading={heading} label={`${heading} books`} description={<p className="catalog-results-count">{description}</p>}
      headingAction={onSeeAll && <button type="button" onClick={onSeeAll} aria-label={`See all ${heading.toLowerCase()} books`} className="catalog-see-all">See all <span aria-hidden="true">›</span></button>}>
      {loading ? <div role="status" aria-label={`Loading ${heading.toLowerCase()}`} className="catalog-shelf-state"><RefreshCw className="animate-spin text-link" /></div>
        : error ? <div role="status" className="catalog-shelf-state catalog-empty"><p>{heading} could not be loaded.</p><button type="button" onClick={onRetry}>Retry {heading.toLowerCase()}</button></div>
          : hasBooks ? children : <p className="catalog-shelf-state text-sm text-muted">{emptyMessage}</p>}
    </BookShelf>
  </div>;
}
