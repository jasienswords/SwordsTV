// SwordsTV taste engine.
// Learns the family's taste from their ratings and ranks unwatched shows by it.
// Everything here is recalculated from the current ratings on every render, so
// the Taste Profile and For You change as soon as a show is rated.

const RATING_WEIGHT = {Loved: 2, Liked: 1, Okay: 0, Disliked: -2};
// "Not interested" on a recommendation counts as a mild dislike: half the weight of a Disliked rating.
const NOT_INTERESTED = {weight: -2, share: 0.5};

// How much each kind of trait counts toward a show's match score.
const TRAIT_WEIGHT = {genre: 1, country: 0.8, network: 0.5, length: 0.35, era: 0.3, rating: 0.4};
const SMOOTHING = 3;      // ratings needed before a trait's average is trusted
const MIN_SHOWN = 3;      // a trait needs this many rated shows to appear on the profile
const MIN_SHOWN_BY_TYPE = {network: 5}; // channels are noisier, so need more

const COUNTRY_NAMES = {GB: 'British', US: 'American', CA: 'Canadian', AU: 'Australian', IE: 'Irish', NZ: 'New Zealand',
  DE: 'German', FR: 'French', ES: 'Spanish', DK: 'Danish', IT: 'Italian', BE: 'Belgian', KR: 'Korean', SE: 'Swedish', NO: 'Norwegian'};

// The family's content limits, matched against TMDB keywords.
const CONTENT_LIMITS = [
  {label: 'Gore or disturbing violence', re: /\b(gore|gory|graphic violence|torture|serial killer|cannibal|body horror|splatter|massacre)\b/},
  {label: 'Bleak or hopeless', re: /\b(dystopia|dystopian|post-apocalyptic|apocalypse|nihilism|suicide|genocide)\b/},
  {label: 'Heavy sexual content', re: /\b(erotic|eroticism|nudity|prostitut\w*|pornograph\w*|sex work\w*)\b/},
  {label: 'Heavy supernatural or fantasy', re: /\b(supernatural|vampire|zombie|werewolf|demon|witchcraft|dark fantasy|occult)\b/}
];

function traitsOf(title) {
  const t = TMDB[title];
  if (!t) return [];
  const out = [];
  (t.genres || []).forEach(g => out.push({key: 'genre:' + g, type: 'genre', label: g}));
  const c = (t.country || [])[0];
  if (c) out.push({key: 'country:' + c, type: 'country', label: COUNTRY_NAMES[c] || c});
  const n = (t.networks || [])[0];
  if (n) out.push({key: 'network:' + n.name, type: 'network', label: n.name});
  if (t.seasons) {
    const len = t.seasons === 1 ? 'Single-season & limited series' : t.seasons <= 4 ? '2–4 seasons' : 'Long-running (5+ seasons)';
    out.push({key: 'length:' + len, type: 'length', label: len});
  }
  if (t.year) { const d = Math.floor(+t.year / 10) * 10; out.push({key: 'era:' + d, type: 'era', label: d + 's shows'}); }
  if (t.rating) out.push({key: 'rating:' + t.rating, type: 'rating', label: 'Rated ' + t.rating});
  return out;
}

function contentFlags(title) {
  const kw = ((TMDB[title] || {}).keywords || []).join(' | ').toLowerCase();
  return CONTENT_LIMITS.filter(l => l.re.test(kw)).map(l => l.label);
}

// IMDb rating (out of 10) from the researched profile or the imported scores.
function imdbOf(title) {
  const r = RESEARCH[title];
  const m = r && String(r.imdb || '').match(/(\d+(?:\.\d+)?)\s*\/\s*10/);
  if (m) return +m[1];
  const sc = typeof SCORES !== 'undefined' && SCORES[title];
  return sc && sc.imdb && sc.imdb.rating != null ? +sc.imdb.rating : null;
}

function buildProfile(shows) {
  const rated = shows.filter(s => s.rating in RATING_WEIGHT);
  const withData = rated.filter(s => TMDB[s.title]);
  const mean = withData.length ? withData.reduce((n, s) => n + RATING_WEIGHT[s.rating], 0) / withData.length : 0;
  const traits = {};
  for (const s of withData) {
    const w = RATING_WEIGHT[s.rating];
    for (const tr of traitsOf(s.title)) {
      const x = traits[tr.key] || (traits[tr.key] = {...tr, n: 0, sum: 0, loved: 0, liked: 0, rated: 0, passed: 0});
      x.n++; x.rated++; x.sum += w; if (s.rating === 'Loved') x.loved++; if (s.rating === 'Liked') x.liked++;
    }
  }
  // Shows passed on with "Not interested" (never rated) add a half-weight dislike to their traits.
  for (const s of shows.filter(s => s.dismissed && !(s.rating in RATING_WEIGHT) && TMDB[s.title])) {
    for (const tr of traitsOf(s.title)) {
      const x = traits[tr.key] || (traits[tr.key] = {...tr, n: 0, sum: 0, loved: 0, liked: 0, rated: 0, passed: 0});
      x.n += NOT_INTERESTED.share; x.sum += NOT_INTERESTED.weight * NOT_INTERESTED.share; x.passed++;
    }
  }
  // Affinity: how much better (or worse) shows with this trait are rated than the family's
  // average rating, shrunk toward zero until there are enough ratings to trust it.
  for (const x of Object.values(traits)) x.affinity = (x.sum - x.n * mean) / (x.n + SMOOTHING);
  const counts = {Loved: 0, Liked: 0, Okay: 0, Disliked: 0};
  rated.forEach(s => counts[s.rating]++);
  const avgImdb = r => { const v = rated.filter(s => s.rating === r).map(s => imdbOf(s.title)).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  return {traits, mean, counts, total: rated.length, imdbLoved: avgImdb('Loved'), imdbDisliked: avgImdb('Disliked'),
    lovedTitles: rated.filter(s => s.rating === 'Loved').map(s => s.title),
    likedTitles: rated.filter(s => s.rating === 'Liked').map(s => s.title)};
}

// TMDB keywords that describe mood or format rather than what a show is about.
const VAGUE_KEYWORDS = new Set(['miniseries', 'tv show', 'documentary series', 'docuseries', 'sitcom', 'woman director', 'duringcreditsstinger',
  'based on novel or book', 'based on comic', 'spin off', 'remake', 'reboot', 'anthology', 'hilarious', 'amused', 'witty', 'familiar',
  'heartfelt', 'cheerful', 'admiring', 'bold', 'exhilarated', 'inspirational', 'comforting', 'whimsical', 'dramatic', 'intense',
  'suspenseful', 'playful', 'joyous', 'celebratory', 'enthusiastic', 'sentimental', 'earnest', 'casual', 'satirical', 'absurd']);
const topics = t => new Set((t.keywords || []).map(k => k.toLowerCase()).filter(k => !VAGUE_KEYWORDS.has(k)));

// Loved/liked shows that TMDB links to this one AND that genuinely overlap with it:
// at least one genre in common and at least one real topic (e.g. "road trip", "baking").
function similarSources(title, profile) {
  const t = TMDB[title];
  if (!t) return [];
  const out = [];
  for (const [list, weight, rating] of [[profile.lovedTitles, 0.35, 'Loved'], [profile.likedTitles, 0.15, 'Liked']]) {
    for (const src of list) {
      const st = TMDB[src];
      if (!st || !((st.similar || []).includes(t.id) || (t.similar || []).includes(st.id))) continue;
      const genre = (t.genres || []).some(g => (st.genres || []).includes(g));
      const a = topics(st), shared = [...topics(t)].filter(k => a.has(k));
      if (genre && shared.length) out.push({title: src, weight, rating, shared: shared.slice(0, 3)});
    }
  }
  return out.sort((x, y) => y.weight - x.weight || y.shared.length - x.shared.length);
}

function matchShow(title, profile) {
  const traits = traitsOf(title);
  let score = 0;
  const genres = traits.filter(t => t.type === 'genre');
  if (genres.length) score += TRAIT_WEIGHT.genre * genres.reduce((n, g) => n + ((profile.traits[g.key] || {}).affinity || 0), 0) / genres.length;
  for (const tr of traits.filter(t => t.type !== 'genre')) score += TRAIT_WEIGHT[tr.type] * ((profile.traits[tr.key] || {}).affinity || 0);
  const because = similarSources(title, profile);
  score += Math.min(1.2, because.reduce((n, b) => n + b.weight, 0));
  const imdb = imdbOf(title);
  if (imdb != null) score += Math.max(-0.8, Math.min(0.8, (imdb - 7.2) * 0.4));
  const flags = contentFlags(title);
  score -= 0.7 * flags.length;
  const reasons = traits.filter(tr => ['genre', 'country', 'network'].includes(tr.type)).map(tr => profile.traits[tr.key]).filter(Boolean)
    .filter(x => x.affinity > 0.05 && x.rated >= (x.type === 'network' ? 8 : 5) && (x.loved + x.liked) / x.rated >= 0.4)
    .sort((a, b) => b.affinity - a.affinity).slice(0, 2)
    .map(x => ({type: x.type, label: x.label, loved: x.loved, liked: x.liked, rated: x.rated}));
  return {score, reasons, because, flags, imdb, title};
}

const minShown = type => MIN_SHOWN_BY_TYPE[type] || MIN_SHOWN;

// Unwatched, unrated shows not already on the Watchlist, best match first.
// Catalog entries that point to the same TMDB show (e.g. a show and its
// "Special Episodes") count as one show, and are skipped if any of them
// has already been rated, watched or listed.
function rankedCandidates(shows, profile) {
  // Not rated, not watched, not on a list, not marked "Not interested", and not snoozed ("Later").
  const isCandidate = s => !(s.rating in RATING_WEIGHT) && !s.watched && s.libraryStatus === 'Not in My Library' && !s.dismissed && !((s.snoozeUntil || 0) > Date.now());
  const taken = new Set(shows.filter(s => TMDB[s.title] && !isCandidate(s)).map(s => TMDB[s.title].id));
  const seen = new Set();
  return shows.filter(s => isCandidate(s) && TMDB[s.title])
    .map(s => ({s, m: matchShow(s.title, profile)}))
    .sort((a, b) => b.m.score - a.m.score || a.s.title.length - b.s.title.length || a.s.title.localeCompare(b.s.title))
    .filter(({s}) => { const id = TMDB[s.title].id; if (taken.has(id) || seen.has(id)) return false; seen.add(id); return true; });
}

const PLURAL = {'Documentary': 'documentaries', 'Comedy': 'comedies', 'Drama': 'dramas', 'Reality': 'reality shows', 'Crime': 'crime shows',
  'Mystery': 'mysteries', 'Sci-Fi & Fantasy': 'sci-fi and fantasy shows', 'Action & Adventure': 'action and adventure shows', 'Family': 'family shows',
  'Animation': 'animated shows', 'War & Politics': 'war and politics shows', 'Western': 'westerns', 'Kids': "kids' shows", 'Talk': 'talk shows'};
const traitName = r => r.type === 'genre' ? (PLURAL[r.label] || r.label.toLowerCase() + ' shows') : r.type === 'country' ? r.label + ' shows' : r.label + ' shows';
const counted = (loved, liked) => [loved ? `loved ${loved}` : '', liked ? `liked ${liked}` : ''].filter(Boolean).join(' and ');

// A plain-language reason, e.g. "Shares themes with Travel Man, which you loved: road trip, travel.
// You've loved 4 and liked 6 of the 15 documentaries you've rated. IMDb 8.4 · Rotten Tomatoes 90%."
function whyText(m) {
  const out = [];
  const b = m.because[0];
  if (b) out.push(`Shares themes with ${b.title}, which you ${b.rating.toLowerCase()}: ${b.shared.slice(0, 3).join(', ')}.`);
  for (const r of m.reasons) out.push(`You've ${counted(r.loved, r.liked)} of the ${r.rated} ${traitName(r)} you've rated.`);
  const sc = (typeof SCORES !== 'undefined' && SCORES[m.title]) || {};
  const rtm = String((RESEARCH[m.title] || {}).rt || '').match(/(\d{1,3})%\s*(?:critic|tomatometer)/i);
  const rt = sc.rt && sc.rt.critics != null ? sc.rt.critics : rtm ? +rtm[1] : null;
  const q = [m.imdb != null ? `IMDb ${m.imdb}` : '', rt != null ? `Rotten Tomatoes ${rt}%` : ''].filter(Boolean).join(' · ');
  if (q) out.push(q + '.');
  if (m.flags.length) out.push('Heads up: ' + m.flags.join(', ').toLowerCase() + '.');
  return out.join(' ');
}
