#!/usr/bin/env node
// Builds providers.json: every U.S. streaming service TMDB knows (TV and movies), with the
// many variants of one service merged ("Paramount Plus Essential", "Paramount+ Amazon Channel",
// … → "Paramount+") and grouped for the service picker. Run by the nightly job.
//
//   TMDB_TOKEN=<token> node tools/providers.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {api} from './lib/tmdb.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Stores and catch-alls rather than subscriptions.
const NOT_SERVICES = /^(amazon video|apple tv store|google play movies|fandango( at home)?|justwatch tv (store|free|plus)|youtube|vimeo|microsoft store|public domain movies)$/i;
// One name per service; the app's existing names win so saved settings keep working.
const RENAME = {
  'disney plus': 'Disney+', 'paramount plus': 'Paramount+', 'paramount+': 'Paramount+', 'hbo max': 'Max', 'max': 'Max',
  'apple tv': 'Apple TV+', 'apple tv plus': 'Apple TV+', 'amazon prime video': 'Prime Video', 'tubi tv': 'Tubi', 'tubi': 'Tubi',
  'pbs': 'PBS / PBS Passport', 'britbox': 'BritBox', 'acorntv': 'Acorn TV', 'acorn tv': 'Acorn TV', 'discovery +': 'Discovery+', 'discovery+': 'Discovery+',
  'mgm plus': 'MGM+', 'mgm+': 'MGM+', 'amc plus': 'AMC+', 'amc+': 'AMC+', 'netflix kids': 'Netflix', 'peacock': 'Peacock', 'starz': 'Starz',
  'bbc select': 'BBC Select', 'hidive': 'HIDIVE', 'curiosity stream': 'CuriosityStream', 'curiositystream': 'CuriosityStream', 'espn plus': 'ESPN+',
  'history vault': 'HISTORY Vault', 'vix': 'ViX', 'vix premium': 'ViX', 'sling tv orange and blue': 'Sling TV', 'sling tv orange': 'Sling TV', 'sling tv blue': 'Sling TV',
  'fubotv': 'Fubo', 'mhz choice': 'MHz Choice', 'mz choice': 'MHz Choice', 'pbs masterpiece': 'PBS Masterpiece', 'hallmark+': 'Hallmark+', 'hallmark tv': 'Hallmark+',
  'great american pure flix': 'Pure Flix', 'fox one': 'Fox One', 'the roku channel': 'The Roku Channel', 'amazon prime video free with ads': 'Prime Video'
};
const GROUPS = {
  live: /^(YouTube TV|Sling TV|Fubo|Philo|DIRECTV STREAM|Spectrum On Demand|Fox One)$/,
  free: /^(Tubi|Pluto TV|The Roku Channel|Plex|Xumo Play|Kanopy|Hoopla|Crackle|Fawesome|FlixHouse|YouTube Free|BYUtv|Filmzie|Amazon MX Player|Fandango at Home Free|Freevee|PBS Kids|KQED|Thirteen|WETA\+)$/,
  network: /^(NBC|ABC|The CW|FXNow|AMC|Freeform|A&E|Lifetime|USA Network|TBS|TNT|TCM|Bravo TV|Food Network|HGTV|TLC|Discovery|History|Science Channel|Animal Planet|Travel Channel|Investigation Discovery|BBC America|VH1|tru TV|Adult Swim|WeTV|OXYGEN|National Geographic|ESPN|Vice TV|FYI Network|Ovation TV|The Oprah Winfrey Network|DisneyNOW)$/
};

export function serviceName(provider) {
  let n = String(provider).trim().replace(/\s+/g, ' ');
  n = n.replace(/\s+(amazon channel|amzon channel|apple tv channel|roku premium channel)$/i, '');
  if (!/^youtube premium$/i.test(n)) n = n.replace(/\s+(premium plus|premium|essential|standard with ads|with ads|basic with ads)$/i, '');
  return RENAME[n.toLowerCase()] || n;
}

const [tv, movie] = await Promise.all(['tv', 'movie'].map(k => api(`/watch/providers/${k}`, {watch_region: 'US'}).then(r => r.results || [])));
const services = new Map();
for (const p of [...tv, ...movie]) {
  if (NOT_SERVICES.test(p.provider_name.trim())) continue;
  const name = serviceName(p.provider_name), pr = (p.display_priorities || {}).US ?? p.display_priority ?? 999;
  const s = services.get(name) || {name, logo: null, priority: 999, aliases: new Set()};
  s.aliases.add(p.provider_name.trim());
  // The plain (non-channel) listing supplies the logo and position.
  const plain = !/channel$/i.test(p.provider_name.trim());
  if (pr < s.priority || (plain && !s.plainLogo)) { s.priority = Math.min(s.priority, pr); if (plain || !s.logo) { s.logo = p.logo_path; s.plainLogo = plain; } }
  services.set(name, s);
}
const list = [...services.values()].sort((a, b) => a.priority - b.priority).map(s => ({
  name: s.name, logo: s.logo, priority: s.priority,
  group: GROUPS.live.test(s.name) ? 'live' : GROUPS.free.test(s.name) ? 'free' : GROUPS.network.test(s.name) ? 'network' : 'subscription',
  aliases: [...s.aliases].sort()
}));
fs.writeFileSync(path.join(ROOT, 'providers.json'), JSON.stringify({
  source: 'Streaming services in the U.S. from TMDB (data by JustWatch).', generated: new Date().toISOString().slice(0, 10), services: list
}) + '\n');
const count = g => list.filter(s => s.group === g).length;
console.log(`Saved ${list.length} services: ${count('subscription')} subscriptions, ${count('live')} live TV, ${count('free')} free, ${count('network')} network apps.`);
