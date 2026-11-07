// Every profile's ratings, as saved by the nightly job in ratings.json.
// Newer files hold {profiles: [{household, profile, legacyCatalog, changes}]}; older ones a single
// family's {changes}, whose catalog ratings (data.json) also count.
import fs from 'node:fs';
import path from 'node:path';

export function loadProfiles(root) {
  const f = path.join(root, 'ratings.json');
  const r = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
  if (Array.isArray(r.profiles) && r.profiles.length) return r.profiles;
  return [{household: 'family', profile: 'family', legacyCatalog: true, changes: r.changes || {}}];
}

// The app's show model for one profile: catalog entries with that profile's ratings applied.
const listed = s => ['Up Next', 'Watching', 'Want to Watch'].includes(s);
export function showsFor(catalog, p) {
  return catalog.map(x0 => {
    const x = p.legacyCatalog ? x0 : {...x0, rating: '', status: 'Unwatched'};
    const c = (p.changes || {})[x.title] || {};
    const libraryStatus = c.libraryStatus ?? (listed(c.status) ? c.status : listed(x.status) ? x.status : 'Not in My Library');
    return {...x, ...c, libraryStatus, watched: c.watched ?? (c.status === 'Watched' || x.status === 'Watched')};
  });
}
