-- Additive category-only release. Original labels are retained for recovery.
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
 count(*) FILTER (WHERE category_override IS NULL) OVER (PARTITION BY raw_api_label COLLATE "C") AS label_count,
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
 SELECT *, CASE WHEN category_override IS NOT NULL THEN category_override
 WHEN lower(btrim(raw_api_label)) = 'sci-fi & fantasy' THEN 'Sci-Fi & Fantasy' WHEN lower(btrim(raw_api_label)) = 'mystery & thriller' THEN 'Mystery & Thriller' WHEN lower(btrim(raw_api_label)) = 'biography & memoir' THEN 'Biography & Memoir' WHEN lower(btrim(raw_api_label)) = 'business & economics' THEN 'Business & Economics' WHEN lower(btrim(raw_api_label)) = 'children & ya' THEN 'Children & YA'
 WHEN clean = '' THEN 'General'
 WHEN strpos(clean, 'science fiction') > 0 OR strpos(clean, 'sci fi') > 0 OR strpos(clean, 'scifi') > 0 OR strpos(clean, 'fantasy') > 0 OR strpos(clean, 'dystopian') > 0 OR strpos(clean, 'space opera') > 0 OR strpos(clean, 'cyberpunk') > 0 THEN 'Sci-Fi & Fantasy'
 WHEN strpos(clean, 'mystery') > 0 OR strpos(clean, 'thriller') > 0 OR strpos(clean, 'suspense') > 0 OR strpos(clean, 'crime') > 0 OR strpos(clean, 'detective') > 0 OR strpos(clean, 'noir') > 0 THEN 'Mystery & Thriller'
 WHEN strpos(clean, 'biography') > 0 OR strpos(clean, 'autobiography') > 0 OR strpos(clean, 'memoir') > 0 OR strpos(clean, 'letters') > 0 OR strpos(clean, 'diaries') > 0 THEN 'Biography & Memoir'
 WHEN strpos(clean, 'business') > 0 OR strpos(clean, 'economics') > 0 OR strpos(clean, 'finance') > 0 OR strpos(clean, 'management') > 0 OR strpos(clean, 'marketing') > 0 THEN 'Business & Economics'
 WHEN strpos(clean, 'juvenile') > 0 OR strpos(clean, 'young adult') > 0 OR clean ~ E'\\mya\\M' OR strpos(clean, 'children''s') > 0 OR strpos(clean, 'picture book') > 0 THEN 'Children & YA'
 ELSE NULL END AS parent
 FROM normalized
), desired AS (
 SELECT id, parent IS NULL AND label_count <= 10 AS hidden,
 coalesce(parent, CASE WHEN label_count <= 10 THEN 'General'
 WHEN char_length(btrim(raw_api_label)) <= 80 THEN btrim(raw_api_label)
 ELSE left(btrim(raw_api_label),67) || ' [' || left(encode(sha256(convert_to(btrim(raw_api_label),'UTF8')),'hex'),10) || ']' END) AS display
 FROM mapped
)
UPDATE public.books AS b SET category = d.display, is_hidden = d.hidden
FROM desired d WHERE b.id=d.id AND (b.category IS DISTINCT FROM d.display OR b.is_hidden IS DISTINCT FROM d.hidden);
