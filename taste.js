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

// Themes pushed down in For You when TMDB keywords mention them. (Violence, sexual content and
// language aren't penalised here: they're shown as tags and handled by the strong-content rule.)
const CONTENT_LIMITS = [
  {label: 'Gore or disturbing violence', re: /\b(gore|gory|graphic violence|torture|serial killer|cannibal|body horror|splatter|massacre)\b/},
  {label: 'Bleak or hopeless', re: /\b(dystopia|dystopian|post-apocalyptic|apocalypse|nihilism|suicide|genocide)\b/},
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

// ── Insights on the Taste Profile ──
// Plain-language observations computed from the family's ratings and TMDB data.
// Each one appears only when enough ratings support it.
function buildInsights(shows) {
  const rated = shows.filter(s => s.rating in RATING_WEIGHT && TMDB[s.title]);
  if (rated.length < 15) return [];
  const isPos = s => s.rating === 'Loved' || s.rating === 'Liked';
  const pct = (a, b) => Math.round(100 * a / b);
  const basePos = rated.filter(isPos).length / rated.length;
  const best = list => list.slice().sort((a, b) => RATING_WEIGHT[b.rating] - RATING_WEIGHT[a.rating] || (imdbOf(b.title) || 0) - (imdbOf(a.title) || 0));
  const group = keyFn => { const g = {}; for (const s of rated) for (const k of [].concat(keyFn(s) || [])) (g[k] = g[k] || []).push(s); return g; };
  const plural = g => PLURAL[g] || g.toLowerCase() + ' shows';
  const out = [];

  // 1. Sweet spot: best-rated genre + country combination.
  const combos = Object.entries(group(s => { const t = TMDB[s.title], c = (t.country || [])[0]; return c ? (t.genres || []).map(g => g + '|' + c) : []; }))
    .map(([k, l]) => ({k, l, pos: l.filter(isPos).length})).filter(x => x.l.length >= 6 && x.pos >= 4)
    .sort((a, b) => b.pos / b.l.length - a.pos / a.l.length || b.l.length - a.l.length);
  if (combos.length && combos[0].pos / combos[0].l.length > basePos + 0.1) {
    const {k, l, pos} = combos[0], [g, c] = k.split('|');
    out.push({title: 'Your sweet spot', text: `${COUNTRY_NAMES[c] || c} ${plural(g)}: you loved or liked ${pos} of the ${l.length} you've rated (${pct(pos, l.length)}%), compared with ${pct(basePos * rated.length, rated.length)}% across everything you've rated.`,
      examples: best(l.filter(isPos)).slice(0, 4).map(s => s.title)});
  }

  // 2 & 3. Themes (TMDB topic keywords) that win you over, or turn you off.
  const themes = Object.entries(group(s => [...topics(TMDB[s.title])])).map(([k, l]) => ({k, l, pos: l.filter(isPos).length, neg: l.filter(s => s.rating === 'Disliked').length}));
  const winners = themes.filter(x => x.l.length >= 5 && x.pos >= 4 && x.pos / x.l.length >= basePos + 0.2).sort((a, b) => b.pos / b.l.length - a.pos / a.l.length || b.pos - a.pos).slice(0, 5);
  if (winners.length >= 2) {
    const shows = [...new Set(winners.flatMap(x => x.l))], pos = shows.filter(isPos).length;
    out.push({title: 'Themes that win you over', text: `These subjects tend to land: ${winners.map(x => `${x.k} (${x.pos} of ${x.l.length} loved or liked)`).join(', ')}.`,
      examples: best(shows.filter(isPos)).slice(0, 4).map(s => s.title)});
  }
  const losers = themes.filter(x => x.l.length >= 5 && x.neg >= 3 && x.neg / x.l.length >= 0.5).sort((a, b) => b.neg / b.l.length - a.neg / a.l.length || b.neg - a.neg).slice(0, 5);
  if (losers.length >= 2) {
    const shows = [...new Set(losers.flatMap(x => x.l))], neg = shows.filter(s => s.rating === 'Disliked').length;
    out.push({title: 'Themes that turn you off', text: `These subjects rarely work for you: ${losers.map(x => `${x.k} (${x.neg} of ${x.l.length} disliked)`).join(', ')}.`,
      examples: shows.filter(s => s.rating === 'Disliked').slice(0, 4).map(s => s.title)});
  }

  // 4. Tone: mature vs family-friendly ratings.
  const tone = l => ({n: l.length, pos: l.filter(isPos).length});
  const ma = tone(rated.filter(s => TMDB[s.title].rating === 'TV-MA')), fam = tone(rated.filter(s => ['TV-G', 'TV-PG', 'TV-Y7'].includes(TMDB[s.title].rating)));
  if (ma.n >= 5 && fam.n >= 5 && Math.abs(ma.pos / ma.n - fam.pos / fam.n) >= 0.15) {
    const lower = ma.pos / ma.n < fam.pos / fam.n;
    out.push({title: 'Tone', text: `You loved or liked ${pct(ma.pos, ma.n)}% of the ${ma.n} TV-MA shows you've rated, versus ${pct(fam.pos, fam.n)}% of the ${fam.n} TV-G and TV-PG shows. ${lower ? 'Lighter, family-friendly shows suit you better.' : 'Mature shows tend to suit you better.'}`});
  }

  // 5. You vs the critics.
  const gems = best(rated.filter(s => isPos(s) && imdbOf(s.title) != null && imdbOf(s.title) < 7.2)).slice(0, 3);
  const misses = rated.filter(s => s.rating === 'Disliked' && (imdbOf(s.title) || 0) >= 8.3).sort((a, b) => imdbOf(b.title) - imdbOf(a.title)).slice(0, 3);
  if (gems.length || misses.length) {
    const parts = [];
    if (gems.length) parts.push(`You enjoyed ${gems.map(s => `${s.title} (IMDb ${imdbOf(s.title)})`).join(', ')} despite middling reviews.`);
    if (misses.length) parts.push(`Critics' favourites ${misses.map(s => `${s.title} (IMDb ${imdbOf(s.title)})`).join(', ')} weren't for you.`);
    out.push({title: 'You vs the critics', text: parts.join(' ') + ' Your taste, not the scores, drives your recommendations.'});
  }

  // 6. Commitment and era.
  const byLen = group(s => { const n = TMDB[s.title].seasons; return n ? (n === 1 ? 'single-season and limited series' : n <= 4 ? 'shows with 2–4 seasons' : 'long-running shows (5+ seasons)') : []; });
  const lens = Object.entries(byLen).map(([k, l]) => ({k, n: l.length, r: l.filter(isPos).length / l.length})).filter(x => x.n >= 8).sort((a, b) => b.r - a.r);
  const byEra = group(s => TMDB[s.title].year ? Math.floor(+TMDB[s.title].year / 10) * 10 + 's' : []);
  const eras = Object.entries(byEra).map(([k, l]) => ({k, n: l.length, r: l.filter(isPos).length / l.length})).filter(x => x.n >= 8).sort((a, b) => b.r - a.r);
  const bits = [];
  if (lens.length >= 2 && lens[0].r - lens[lens.length - 1].r >= 0.15) bits.push(`${lens[0].k[0].toUpperCase() + lens[0].k.slice(1)} land best (${pct(lens[0].r * lens[0].n, lens[0].n)}% loved or liked), ${lens[lens.length - 1].k} least (${pct(lens[lens.length - 1].r * lens[lens.length - 1].n, lens[lens.length - 1].n)}%).`);
  if (eras.length >= 2 && eras[0].r - eras[eras.length - 1].r >= 0.15) bits.push(`Shows from the ${eras[0].k} suit you best (${pct(eras[0].r * eras[0].n, eras[0].n)}%); the ${eras[eras.length - 1].k} the least (${pct(eras[eras.length - 1].r * eras[eras.length - 1].n, eras[eras.length - 1].n)}%).`);
  if (bits.length) out.push({title: 'Length and era', text: bits.join(' ')});
  return out;
}
