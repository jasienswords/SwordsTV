// Turns written content notes (review notes, researched cautions, U.S. rating) into
// levels for the show page's colour-coded tags: none | mild | moderate | strong.
export function levelsFrom(text, usRating) {
  // Phrases that rule violence out shouldn't count as violence.
  const t = (' ' + String(text || '').toLowerCase() + ' ')
    .replace(/violence-free|low on graphic violence|limited violence|not primarily violent|(without|nothing|no|not) graphic( violence| detail| noted)?|little conventional mature content|no significant content concerns/g, ' ')
    .replace(/occasional strong language/g, 'occasional language');
  const pick = rules => { for (const [lvl, re] of rules) if (re.test(t)) return lvl; return 'none'; };
  const violence = pick([
    ['strong', /graphic|gore|gory|brutal|torture|disturbing violence|massacre|child murder/],
    ['moderate', /violence|violent|gunfight|shootout|fight|assault|terror|explosion|war\b|wartime|combat/],
    ['mild', /murder|peril|crime|predat|hunting|injur|danger|threat/]]);
  const sex = pick([
    ['strong', /nudity|explicit|sex scene|sexual assault|rape/],
    ['moderate', /sexual content|sexual reference|sexual humou?r|sexual joke|sexual situation|sexual relationship|frank sexual|sexual theme/],
    ['mild', /innuendo|romance|romantic|adult joke|adult relationship|infidelity|kissing/]]);
  const language = pick([
    ['moderate', /occasional language/],
    ['mild', /mild language|occasional mild/],
    ['strong', /strong language|frequent strong|profanity|swear|sweary|f-word/],
    ['moderate', /language|crude|vulgar/]]);
  const THEMES = [['grief', /grief|loss of|bereave|death of/], ['suicide', /suicid/], ['depression', /depress/], ['addiction', /addict|drug|alcohol|drinking/],
    ['abuse', /abuse/], ['trauma', /trauma/], ['terrorism', /terroris/], ['war', /\bwar\b|wartime|world war/], ['illness', /illness|cancer|medical complication/],
    ['supernatural', /supernatural|witch|occult|magic|fantasy/], ['heavy themes', /bleak|dark tone|dark humou?r|cynical|somber|sombre|disturbing|emotionally (heavy|raw|intense|dark)/]];
  const themes = THEMES.filter(([, re]) => re.test(t)).map(([k]) => k);
  return {violence, sex, language, themes, usRating: usRating || null};
}
export const LEVELS = ['none', 'mild', 'moderate', 'strong'];
