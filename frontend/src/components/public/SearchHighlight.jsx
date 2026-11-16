import { catalogMatchParts } from '../../api/catalogDiscovery';

export default function SearchHighlight({ text, query }) {
  return catalogMatchParts(text, query).map((part, index) => part.match
    ? <mark className="catalog-search-hit" key={index}>{part.text}</mark>
    : <span key={index}>{part.text}</span>);
}
