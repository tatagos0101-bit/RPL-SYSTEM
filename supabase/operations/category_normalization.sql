-- Fixed Open Library browse categories (2026-11-07). Original labels are retained.
-- Run atomically through the migration tool with an authorized maintenance role.
SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';
LOCK TABLE public.books IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS raw_api_label varchar(1000);
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS category_override varchar(80);
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT true;
UPDATE public.books SET raw_api_label = category WHERE raw_api_label IS NULL;
WITH raw AS (
 SELECT id, raw_api_label, category_override,
 replace(lower(normalize(raw_api_label, NFKC)), chr(8217), chr(39)) AS value
 FROM public.books
), protected AS (
 SELECT *, regexp_replace(value, E'\\mscience[\\s/-]+fiction\\M', 'sciencefictiontoken', 'g') AS compound FROM raw
), separators AS (
 SELECT *, regexp_replace(compound, '[-/–—:]+', ' ', 'g') AS separated FROM protected
), punctuation AS (
 SELECT *, regexp_replace(separated, '[^[:alnum:]_[:space:]'']', ' ', 'g') AS plain FROM separators
), generic AS (
 SELECT *, regexp_replace(plain, E'\\m(general|fiction|nonfiction|non fiction)\\M', ' ', 'g') AS specific FROM punctuation
), normalized AS (
 SELECT *, btrim(regexp_replace(replace(specific, 'sciencefictiontoken', 'science fiction'), E'\\s+', ' ', 'g')) AS clean FROM generic
), mapped AS (
 SELECT *, CASE WHEN category_override IN ('General', 'Kids', 'Sci-Fi', 'Fantasy', 'Mystery', 'Thriller', 'Crime', 'Drama', 'Horror', 'Romance', 'Biography', 'History') THEN category_override
 WHEN lower(btrim(raw_api_label)) = 'kids' THEN 'Kids'
 WHEN lower(btrim(raw_api_label)) = 'sci-fi' THEN 'Sci-Fi'
 WHEN lower(btrim(raw_api_label)) = 'fantasy' THEN 'Fantasy'
 WHEN lower(btrim(raw_api_label)) = 'mystery' THEN 'Mystery'
 WHEN lower(btrim(raw_api_label)) = 'thriller' THEN 'Thriller'
 WHEN lower(btrim(raw_api_label)) = 'crime' THEN 'Crime'
 WHEN lower(btrim(raw_api_label)) = 'drama' THEN 'Drama'
 WHEN lower(btrim(raw_api_label)) = 'horror' THEN 'Horror'
 WHEN lower(btrim(raw_api_label)) = 'romance' THEN 'Romance'
 WHEN lower(btrim(raw_api_label)) = 'biography' THEN 'Biography'
 WHEN lower(btrim(raw_api_label)) = 'history' THEN 'History'
 WHEN clean = '' THEN 'General'
 WHEN clean ~ E'\\m(juvenile|young adult|ya|children|picture book|kids)\\M' THEN 'Kids'
 WHEN clean ~ E'\\m(science fiction|sci fi|scifi|dystopian|space opera|cyberpunk)\\M' THEN 'Sci-Fi'
 WHEN clean ~ E'\\m(fantasy|magic|fairy tales)\\M' THEN 'Fantasy'
 WHEN clean ~ E'\\m(mystery|mysteries|detective|whodunit)\\M' THEN 'Mystery'
 WHEN clean ~ E'\\m(thriller|suspense|espionage)\\M' THEN 'Thriller'
 WHEN clean ~ E'\\m(crime|criminal|noir)\\M' THEN 'Crime'
 WHEN clean ~ E'\\m(drama|plays|theater|theatre)\\M' THEN 'Drama'
 WHEN clean ~ E'\\m(horror|ghost stories)\\M' THEN 'Horror'
 WHEN clean ~ E'\\m(romance|romantic|love stories)\\M' THEN 'Romance'
 WHEN clean ~ E'\\m(biography|biographies|autobiography|memoir|diaries)\\M' THEN 'Biography'
 WHEN clean ~ E'\\m(history|historical|civilization)\\M' THEN 'History'
 ELSE NULL END AS parent
 FROM normalized
), desired AS (
 SELECT id, parent IS NULL AS hidden, coalesce(parent, 'General') AS display
 FROM mapped
)
UPDATE public.books AS b SET category = d.display, is_hidden = d.hidden
FROM desired d WHERE b.id=d.id AND (b.category IS DISTINCT FROM d.display OR b.is_hidden IS DISTINCT FROM d.hidden);
