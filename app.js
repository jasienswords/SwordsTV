let DATA=null,RESEARCH={},TMDB={},SCORES={},DISCOVERED={};
const IMG="https://image.tmdb.org/t/p/";
const img=(p,size)=>p?IMG+size+p:"";
const tm=t=>TMDB[t]||null;
// Shows found by the nightly search and approved by its content review join the catalog.
function addDiscoveries(dc){const have=new Set(DATA.catalog.map(x=>x.title));for(const [title,d] of Object.entries((dc&&dc.shows)||{})){if(!d.guidance||d.guidance.status!=="ok"||have.has(title))continue;DATA.catalog.push({title,rating:"",status:"Unwatched",note:""});TMDB[title]=d.tmdb;SCORES[title]=d.scores;DISCOVERED[title]=d}}
let SCORES_CHECKED="";
// Scores for shows without a hand-researched profile, in the same shape the ratings panel reads.
function scoreResearch(title){const x=SCORES[title];if(!x)return {};const rt=x.rt||{};
 return {imdb:x.imdb&&x.imdb.rating!=null?x.imdb.rating+"/10 ("+Number(x.imdb.votes).toLocaleString("en-US")+" ratings)":"",
  rt:[rt.critics!=null?rt.critics+"% critic":"",rt.audience!=null?rt.audience+"% audience":""].filter(Boolean).join(" / "),
  metascore:x.metascore};}
function scoreSources(title,t){const x=SCORES[title]||{},links=[];
 if(t&&t.imdb&&x.imdb&&x.imdb.rating!=null)links.push(`<a href="https://www.imdb.com/title/${esc(t.imdb)}/" target="_blank" rel="noopener">IMDb</a>`);
 if(x.rt&&x.rt.url)links.push(`<a href="${esc(x.rt.url)}" target="_blank" rel="noopener">Rotten Tomatoes</a>`);
 if(x.metascore&&x.metascore.url)links.push(`<a href="${esc(x.metascore.url)}" target="_blank" rel="noopener">Metacritic</a>`);
 return links.length?" Review scores from "+links.join(" · ")+(SCORES_CHECKED?" (checked "+esc(SCORES_CHECKED)+")":"")+".":"";}
const STORAGE="swordstv_v1_user_changes";
let changes=JSON.parse(localStorage.getItem(STORAGE)||"{}"),currentTitle=null,currentView="home",searchTerm="",ratingFilter="All";
const colors=[["#35566b","#172536"],["#76533e","#2a1b20"],["#4e6470","#1c2b3b"],["#796b48","#29251d"],["#5c496d","#211c32"],["#3d6b5e","#182b2a"],["#76505c","#2b1b2a"],["#4b5c82","#1a2039"]];
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function allShows(){return DATA.catalog.map(x=>{let c=changes[x.title]||{},legacyStatus=x.status||"Unwatched";return {...x,...c,seriesComplete:c.seriesComplete??["Ended","Canceled"].includes((TMDB[x.title]||{}).status),libraryStatus:c.libraryStatus??(["Up Next","Watching","Want to Watch"].includes(c.status)?c.status:["Up Next","Watching","Want to Watch"].includes(legacyStatus)?legacyStatus:"Not in My Library"),watched:c.watched??(c.status==="Watched"||legacyStatus==="Watched"),status:c.libraryStatus??(["Up Next","Watching","Want to Watch"].includes(c.status)?c.status:["Up Next","Watching","Want to Watch"].includes(legacyStatus)?legacyStatus:"Not in My Library")}}).sort((a,b)=>a.title.localeCompare(b.title))}
function getShow(t){return allShows().find(x=>x.title===t)}
function art(title){let h=0;for(let c of title)h=(h*31+c.charCodeAt(0))>>>0;return colors[h%colors.length]}
function poster(s,small=false){let [a,b]=art(s.title),t=tm(s.title),src=t&&img(t.poster,"w342");return `<div class="poster${src?" has-img":""}" style="--c1:${a};--c2:${b}">${src?`<img class="poster-img" src="${src}" alt="" loading="lazy" decoding="async" crossorigin="anonymous" onerror="this.parentNode.classList.remove('has-img');this.remove()">`:""}${DISCOVERED[s.title]&&!RATINGS.includes(s.rating)?`<span class="tag r-next">New find</span>`:`<span class="tag r-${({Loved:"loved",Liked:"liked",Okay:"okay",Disliked:"disliked"})[s.rating]||"none"}">${esc(shownRating(s))}</span>`}<div class="poster-title">${esc(s.title)}</div></div>`}
function captionOf(s){const l=listLabel(s);if(RATINGS.includes(s.rating)||l!=="Not on a list")return shownRating(s)+" · "+l;const t=tm(s.title)||{};return [(t.genres||[])[0],((t.networks||[])[0]||{}).name].filter(Boolean).join(" · ")||"Not rated"}
const REC_ACTIONS=`<div class="rec-actions"><button data-act="next" aria-label="Add to Up Next">＋ Up Next</button><button data-act="later" aria-label="Remind me later">Later</button><button data-act="no" aria-label="Not interested">✕</button></div>`;
// Compact icon version for poster cards (thumbs up = Up Next, alarm clock = Later, thumbs down = Not interested).
const ICON=d=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const REC_ICONS=`<div class="rec-actions icons">`
 +`<button data-act="next" aria-label="Add to Up Next" title="Add to Up Next">${ICON("M2 21h4V9H2v12zm20-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L13.17 1 6.59 7.59C6.22 7.95 6 8.45 6 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z")}</button>`
 +`<button data-act="later" aria-label="Remind me later" title="Remind me later">${ICON("M22 5.72l-4.6-3.86-1.29 1.53 4.6 3.86L22 5.72zM7.88 3.39L6.6 1.86 2 5.71l1.29 1.53 4.59-3.85zM12.5 8H11v6l4.75 2.85.75-1.23-4-2.37V8zM12 4c-4.97 0-9 4.03-9 9s4.02 9 9 9c4.97 0 9-4.03 9-9s-4.03-9-9-9zm0 16c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z")}</button>`
 +`<button data-act="no" aria-label="Not interested" title="Not interested">${ICON("M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z")}</button></div>`;
function card(s,extra,rec){return `<article class="show" data-title="${esc(s.title)}">${poster(s)}<div class="show-meta"><strong>${esc(s.title)}</strong><span>${esc(captionOf(s))}</span>${extra?`<small class="next-ep">${esc(extra)}</small>`:""}</div>${rec?REC_ICONS:""}</article>`}
function recRail(list){return `<div class="grid rail">${list.map(s=>card(s,null,true)).join("")}</div>`}
// Up Next / Remind me later / Not interested — the next match fills the gap automatically.
const SNOOZE_DAYS=30;
function recAction(title,act){
 const c=changes[title]||{},prev={libraryStatus:c.libraryStatus??"Not in My Library",status:c.status??"Not in My Library",snoozeUntil:c.snoozeUntil||0,dismissed:!!c.dismissed};
 const msg={next:"Added to Up Next",later:`Hidden for ${SNOOZE_DAYS} days`,no:"Won't suggest it again"}[act];
 const obj=act==="next"?{libraryStatus:"Up Next",status:"Up Next"}:act==="later"?{snoozeUntil:Date.now()+SNOOZE_DAYS*864e5}:{dismissed:true};
 saveChange(title,obj,{msg,undo:()=>saveChange(title,prev,{msg:"Undone"})});
}
const RATINGS=["Loved","Liked","Okay","Disliked"];
function shownRating(s){return RATINGS.includes(s.rating)?s.rating:"Not rated"}
function shortMeta(r){if(!r)return [];const g=String(r.genre||"").split("/")[0].trim(),cr=String(r.rating||"").match(/\b(TV-(?:Y7|Y|G|PG|14|MA)|PG-13|PG|G|R)\b/);return [g,cr&&cr[1]].filter(Boolean)}
function stars(v){const n=Math.max(0,Math.min(10,Math.round(Number(v)||0)));return '<div class="stars" aria-hidden="true">'+"★".repeat(n)+'<span class="off">'+"★".repeat(10-n)+'</span></div>'}
function initials(name){const w=String(name).replace(/\(.*?\)/g,"").split(/[^A-Za-z0-9+]+/).filter(Boolean);return (w.length>1?w[0][0]+w[1][0]:String(w[0]||"?").slice(0,2)).toUpperCase()}
function heading(title,sub=""){return `<div class="section-head"><div><h3>${title}</h3>${sub?`<p>${sub}</p>`:""}</div></div>`}
let previousView="home",previousScroll=0;
function syncWelcome(){let w=document.querySelector(".welcome");if(w)w.classList.toggle("hidden",currentView!=="home")}
function openDetail(title){if(currentView!=="detail"){previousView=currentView;previousScroll=window.scrollY}currentTitle=title;currentView="detail";renderDetail();window.scrollTo(0,0)}
// ── Lists ──
// My Library: rated shows you finished, or whose series has ended (and you're not still watching).
// Series still airing join My Library only once marked "Completed". Shows rated before this rule
// existed (midnight Central, Nov 7 2026) count as completed, per the owner: all seasons so far were watched.
const COMPLETED_RULE_FROM=Date.UTC(2026,10,7,6,0,0);
function isOngoing(s){const t=tm(s.title);return !!t&&!!t.status&&!["Ended","Canceled"].includes(t.status)}
function isCompleted(s){if(s.completed===true)return true;if(s.completed===false)return false;if(!isOngoing(s))return s.watched===true||s.seriesComplete===true;return s.watched===true&&!((s._t||0)>COMPLETED_RULE_FROM)}
function inLibrary(s){return RATINGS.includes(s.rating)&&isCompleted(s)&&s.libraryStatus!=="Watching"}
function listLabel(s){return s.libraryStatus==="Up Next"?"Up Next":s.libraryStatus==="Watching"?"Watching":s.libraryStatus==="Want to Watch"?"Want to Watch":inLibrary(s)?"In My Library":"Not on a list"}
function nextEpisodeText(s){const n=(tm(s.title)||{}).nextEpisode;if(!n||!n.date)return "";const d=new Date(n.date+"T12:00:00");return "S"+n.season+" E"+n.episode+" · "+d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}
function rail(list,extra){return `<div class="grid rail">${list.map(s=>card(s,extra&&extra(s))).join("")}</div>`}
function gridOf(list,extra){return `<div class="grid">${list.map(s=>card(s,extra&&extra(s))).join("")}</div>`}

// ── For You: ranked by the Taste Profile ──
// Content levels (none / mild / moderate / strong) for violence, sexual content and language, plus themes.
function contentLevels(t){return (GUIDANCE[t]&&GUIDANCE[t].levels)||(DISCOVERED[t]&&DISCOVERED[t].guidance&&DISCOVERED[t].guidance.levels)||null}
// For You recommends content-reviewed shows. Moderate violence, sexual content and language are fine (they're
// tagged on the show page); a show with STRONG content is only recommended when it's a strong match.
const STRONG_FIT=1.2;
function eligible(t,m){const g=GUIDANCE[t];if(g&&g.status==="blocked")return false;if(ADDED[t])return true;const l=contentLevels(t);if(!l)return false;
 const strong=["violence","sex","language"].some(k=>l[k]==="strong");return !strong||(m&&m.score>=STRONG_FIT)}
const cap=x=>x[0].toUpperCase()+x.slice(1);
function contentTags(s){const l=contentLevels(s.title),us=(l&&l.usRating)||(tm(s.title)||{}).rating;
 const rating=us?`<span class="ctag rating">Rated ${esc(us)}</span>`:"";
 if(!l)return `<div class="content-tags">${rating}<span class="ctag unk">Content not reviewed yet</span></div>`;
 // On a TV-MA show, a category the review notes don't mention reads "Not noted" rather than "None".
 const tag=(k,label)=>l[k]==="none"&&us==="TV-MA"?`<span class="ctag unk">${label}: Not noted</span>`:`<span class="ctag lvl-${l[k]}">${label}: ${cap(l[k])}</span>`;
 return `<div class="content-tags" aria-label="Content">${rating}${tag("violence","Violence")}${tag("sex","Sexual content")}${tag("language","Language")}${(l.themes||[]).map(x=>`<span class="ctag theme">${esc(cap(x))}</span>`).join("")}</div>`}
function firstSentence(t){const m=String(t).match(/^.{20,220}?[.!?](?=\s|$)/);return m?m[0]:String(t).slice(0,200)+(String(t).length>200?"…":"")}
function renderHome(){
 const all=allShows().filter(s=>!PREVIEW.has(s.title)),profile=buildProfile(all),ranked=rankedCandidates(all,profile).filter(x=>eligible(x.s.title,x.m)),seen=new Set();
 const take=(list,n)=>{const out=list.filter(x=>!seen.has(x.s.title)).slice(0,n);out.forEach(x=>seen.add(x.s.title));return out.map(x=>x.s)};
 let html;
 if(ranked.length){
  const {s:f,m}=ranked[0];seen.add(f.title);
  const [c1,c2]=art(f.title),ft=tm(f.title)||{},bd=img(ft.backdrop,"w1280");
  const meta=[ft.genres&&ft.genres[0],COUNTRY_NAMES[(ft.country||[])[0]],(ft.networks||[])[0]&&ft.networks[0].name].filter(Boolean);
  html=`<section class="spotlight${bd?" has-bd":""}" data-title="${esc(f.title)}" style="--c1:${c1};--c2:${c2}${bd?`;--bd:url(${bd})`:""}"><div class="eyebrow">Top match for the Swords family</div><h2>${esc(f.title)}</h2><div class="meta-line"><span class="badge-new">Top match</span>${meta.map(x=>`<span class="dot">·</span><span>${esc(x)}</span>`).join("")}</div>${ft.overview?`<p class="spot-about">${esc(firstSentence(ft.overview))}</p>`:""}${whyText(m)?`<p class="spot-why"><strong>Why it's your top match</strong>${esc(whyText(m))}</p>`:""}${REC_ACTIONS}</section>`;
 }else html=`<section class="hero"><div class="hero-content"><div class="eyebrow">Picked for the Swords family</div><h2>You've seen everything here.</h2><p>New matches will appear as more shows are added.</p></div></section>`;
 const finds=take(ranked.filter(x=>DISCOVERED[x.s.title]),12);
 if(finds.length)html+=heading("New finds for you")+recRail(finds);
 const top=take(ranked,12);
 if(top.length)html+=heading("Top matches for you")+recRail(top);
 // "Because you loved…" rows rotate daily through loved shows that have enough similar picks.
 const day=Math.floor(Date.now()/864e5),loved=profile.lovedTitles,rows=[];
 for(let i=0;i<loved.length&&rows.length<2;i++){const src=loved[(i+day)%loved.length];const items=ranked.filter(x=>x.m.because.includes(src)&&!seen.has(x.s.title));if(items.length>=3)rows.push([src,take(items,10)])}
 rows.forEach(([src,items])=>html+=heading(`Because you loved ${esc(src)}`)+recRail(items));
 // Your two highest-rated genres.
 Object.values(profile.traits).filter(x=>x.type==="genre"&&x.n>=minShown("genre")&&x.affinity>0.05).sort((a,b)=>b.affinity-a.affinity).slice(0,2).forEach(g=>{
  const items=take(ranked.filter(x=>(tm(x.s.title).genres||[])[0]===g.label),10);
  if(items.length>=3)html+=heading(`More ${esc(g.label)}`)+recRail(items)});
 const active=new Set(getSubscriptions().filter(x=>x.active).map(x=>x.name));
 const onYours=take(ranked.filter(x=>((tm(x.s.title).providers||{}).stream||[]).some(p=>active.has(serviceFor(p.name)))),10);
 if(onYours.length)html+=heading("On your streaming services")+recRail(onYours);
 const free=take(ranked.filter(x=>{const p=tm(x.s.title).providers||{};return (p.free||[]).length||(p.ads||[]).length}),10);
 if(free.length)html+=heading("Free to watch")+recRail(free);
 const watching=all.filter(s=>s.libraryStatus==="Watching");
 if(watching.length)html+=heading("Continue watching")+rail(watching);
 const today=new Date().toISOString().slice(0,10);
 // Episodes of shows you love, like or are watching: just aired, scheduled, and announced seasons.
 const followed=s=>["Loved","Liked"].includes(s.rating)||["Up Next","Watching","Want to Watch"].includes(s.libraryStatus);
 const daysAgo=d=>Math.floor((Date.parse(today+"T12:00:00Z")-Date.parse(d+"T12:00:00Z"))/864e5);
 const fmtDate=d=>new Date(d+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"});
 const justAired=all.filter(s=>{const l=(tm(s.title)||{}).lastEpisode;return followed(s)&&l&&l.date&&daysAgo(l.date)>=0&&daysAgo(l.date)<=7})
  .sort((a,b)=>tm(b.title).lastEpisode.date.localeCompare(tm(a.title).lastEpisode.date));
 if(justAired.length)html+=heading("New this week")+rail(justAired,s=>{const l=tm(s.title).lastEpisode;return "S"+l.season+" E"+l.episode+" · aired "+(daysAgo(l.date)===0?"today":fmtDate(l.date))});
 const upcoming=all.filter(s=>{const n=(tm(s.title)||{}).nextEpisode;return followed(s)&&n&&n.date>=today})
  .sort((a,b)=>tm(a.title).nextEpisode.date.localeCompare(tm(b.title).nextEpisode.date));
 if(upcoming.length)html+=heading("New & Upcoming")+gridOf(upcoming,nextEpisodeText);
 const announced=all.filter(s=>{const t=tm(s.title)||{};return followed(s)&&t.announcedSeason&&!(t.nextEpisode&&t.nextEpisode.date>=today)})
  .sort((a,b)=>a.title.localeCompare(b.title));
 if(announced.length)html+=heading("Season announced")+rail(announced,s=>"Season "+tm(s.title).announcedSeason+" announced · date TBA");
 return html;
}

// ── My Library: rated shows you've finished or whose series has ended ──
function renderLibrary(){
 const q=searchTerm.toLowerCase(),lib=allShows().filter(inLibrary).filter(s=>s.title.toLowerCase().includes(q));
 const groups=RATINGS.filter(r=>ratingFilter==="All"||ratingFilter===r).map(r=>[r,lib.filter(s=>s.rating===r)]).filter(([,l])=>l.length);
 const total=groups.reduce((n,[,l])=>n+l.length,0);
 return `${heading("My Library",`${total} rated shows you've finished or whose series has ended`)}<div class="filters"><input id="search" class="field search" placeholder="Search your library…" value="${esc(searchTerm)}"><select id="ratingFilter" class="field"><option>All</option><option>Loved</option><option>Liked</option><option>Okay</option><option>Disliked</option></select></div>`
  +(groups.map(([r,l])=>`<h4 class="group-head">${r} <span>${l.length}</span></h4>${gridOf(l)}`).join("")||`<div class="empty">${q||ratingFilter!=="All"?"No shows match.":"No finished shows yet. Rate a show you've watched and it will appear here."}</div>`);
}

// ── Watchlist: what you're watching now, and what's next ──
function renderWatchlist(){
 const all=allShows(),next=all.filter(s=>s.libraryStatus==="Up Next"),watching=all.filter(s=>s.libraryStatus==="Watching"),want=all.filter(s=>s.libraryStatus==="Want to Watch");
 return `${heading("My Queue",`${next.length} up next · ${watching.length} watching · ${want.length} want to watch`)}`
  +`<h4 class="group-head">Up Next <span>${next.length}</span></h4>`+(next.length?gridOf(next):`<div class="empty">Tap “＋ Up Next” on any recommendation to line it up here.</div>`)
  +`<h4 class="group-head">Watching <span>${watching.length}</span></h4>`+(watching.length?gridOf(watching,nextEpisodeText):`<div class="empty">Nothing in progress. Open a show and tap “Add as Watching”.</div>`)
  +`<h4 class="group-head">Want to Watch <span>${want.length}</span></h4>`+(want.length?gridOf(want):`<div class="empty">Nothing saved yet. Tap “Want to Watch” on any show.</div>`)
  +`<div class="note">When you rate a show you've finished, it moves to My Library.</div>`;
}


// ── Taste Profile: learned from your ratings ──
function traitBar(x,max){const w=Math.max(6,Math.round(Math.abs(x.affinity)/max*100));return `<div class="trait"><div class="trait-label">${esc(x.label)}<small>${x.rated} rated${x.passed?` · ${x.passed} passed on`:""}</small></div><div class="trait-bar"><span class="${x.affinity>0?"pos":"neg"}" style="width:${w}%"></span></div></div>`}
function renderProfile(){
 const p=buildProfile(allShows()),tr=Object.values(p.traits).filter(x=>x.n>=minShown(x.type));
 const loves=tr.filter(x=>x.affinity>0.05).sort((a,b)=>b.affinity-a.affinity).slice(0,10),avoids=tr.filter(x=>x.affinity<-0.05).sort((a,b)=>a.affinity-b.affinity).slice(0,8);
 const max=Math.max(0.01,...loves.concat(avoids).map(x=>Math.abs(x.affinity)));
 const rule=d=>(DATA.tasteProfile.find(x=>x.dimension===d)||{}).profile||"";
 return `${heading("Your family's taste profile",`Learned from ${p.total} ratings. Updates every time you rate a show.`)}`
  +`<div class="rating-split">${RATINGS.map(r=>`<div class="fact"><small>${r}</small><strong>${p.counts[r]}</strong></div>`).join("")}</div>`
  +`<div class="card"><h3 class="card-title">What you rate highly</h3>${loves.map(x=>traitBar(x,max)).join("")||'<p class="muted">Rate a few more shows to see patterns.</p>'}</div>`
  +`<div class="card"><h3 class="card-title">What you tend to rate lower</h3>${avoids.map(x=>traitBar(x,max)).join("")||'<p class="muted">No clear dislikes yet.</p>'}</div>`
  +(p.imdbLoved!=null&&p.imdbDisliked!=null?`<div class="facts"><div class="fact"><small>Shows you love · average IMDb</small><strong>${p.imdbLoved.toFixed(1)}</strong></div><div class="fact"><small>Shows you dislike · average IMDb</small><strong>${p.imdbDisliked.toFixed(1)}</strong></div></div>`:"")
  +`<div class="card"><h3 class="card-title">Your content settings</h3><p class="muted">Moderate violence, sexual content and language are fine. Every show page tags them in colour: <span class="ctag lvl-mild">Mild</span> <span class="ctag lvl-moderate">Moderate</span> <span class="ctag lvl-strong">Strong</span>. Shows with strong content only appear in For You when they're a strong match for your taste.</p><p class="muted" style="margin-top:10px">Pushed down in For You when TMDB's keywords mention them:</p><div class="service-row">${CONTENT_LIMITS.map(l=>`<span class="pill">${esc(l.label)}</span>`).join("")}</div></div>`
  +(()=>{const ins=buildInsights(allShows());return ins.length?`<div class="card insights"><h3 class="card-title">Insights on Your Taste Profile</h3><p class="muted">What your ratings say about why shows resonate with you (or don’t). Updates as you rate.</p>${ins.map(i=>`<div class="insight"><strong>${esc(i.title)}</strong><p>${esc(i.text)}</p>${i.examples&&i.examples.length?`<div class="service-row">${i.examples.map(t=>`<span class="pill" data-title="${esc(t)}">${esc(t)}</span>`).join("")}</div>`:""}</div>`).join("")}</div>`:""})()
  +(()=>{const hidden=allShows().filter(s=>s.dismissed||(s.snoozeUntil||0)>Date.now());return hidden.length?`<details class="card"><summary><strong>Hidden from For You (${hidden.length})</strong></summary>${hidden.map(s=>`<div class="hidden-row"><span>${esc(s.title)}<small>${s.dismissed?"Not interested":"Later · until "+new Date(s.snoozeUntil).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</small></span><button class="btn" data-unhide="${esc(s.title)}">Show again</button></div>`).join("")}</details>`:""})()
  +renderStreamingInsights()
  +`<div class="note">To install on iPhone: open the hosted SwordsTV link in Safari, tap Share, then Add to Home Screen.</div>`;
}

function renderHistory(){
let watched=DATA.roundHistory.filter(x=>String(x.status).toLowerCase()==="watched" && x.rating && !["haven't watched","not rated","unrated"].includes(String(x.rating).toLowerCase()));
let groups={};["Loved","Liked","Okay","Disliked"].forEach(r=>groups[r]=watched.filter(x=>x.rating===r));
return `${heading("Ratings History",`${watched.length} watched-show rating records`)}<p style="color:var(--muted);font-size:13px;margin:-4px 0 18px">Only shows marked as watched appear here. Shows you haven't watched remain eligible for recommendations.</p>${["Loved","Liked","Okay","Disliked"].map(r=>`<details ${r==="Loved"||r==="Liked"?"open":""} style="background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:14px;margin:10px 0"><summary><strong>${r}</strong> <span style="color:var(--muted)"> · ${groups[r].length} shows</span></summary><div style="margin-top:12px;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:7px">${groups[r].map(x=>`<div class="pill" style="justify-content:flex-start">${esc(x.title)}</div>`).join("")||`<span style="color:var(--muted);font-size:12px">No shows in this category yet.</span>`}</div></details>`).join("")}`;
}

const SUBSCRIPTION_DEFAULTS=[{"name": "Netflix", "active": true, "monthlyCost": ""}, {"name": "Hulu", "active": true, "monthlyCost": ""}, {"name": "Disney+", "active": true, "monthlyCost": ""}, {"name": "Max", "active": true, "monthlyCost": ""}, {"name": "Peacock", "active": true, "monthlyCost": ""}, {"name": "Paramount+", "active": true, "monthlyCost": ""}, {"name": "Apple TV+", "active": true, "monthlyCost": ""}, {"name": "YouTube TV", "active": true, "monthlyCost": ""}, {"name": "Prime Video", "active": false, "monthlyCost": ""}, {"name": "BritBox", "active": false, "monthlyCost": ""}, {"name": "Acorn TV", "active": false, "monthlyCost": ""}, {"name": "PBS / PBS Passport", "active": false, "monthlyCost": ""}, {"name": "BBC Select", "active": false, "monthlyCost": ""}, {"name": "The Roku Channel", "active": false, "monthlyCost": ""}, {"name": "Tubi", "active": false, "monthlyCost": ""}, {"name": "Plex", "active": false, "monthlyCost": ""}];
const SUBS_KEY="swordstv_subscriptions_v1";
function getSubscriptions(){try{let saved=JSON.parse(localStorage.getItem(SUBS_KEY)||"{}");return SUBSCRIPTION_DEFAULTS.map(x=>({...x,...(saved[x.name]||{})}))}catch{return SUBSCRIPTION_DEFAULTS}}
function saveSubscriptions(){let obj={};SUBSCRIPTION_DEFAULTS.forEach(x=>{let n=x.name;obj[n]={active:document.querySelector('[data-sub-active="'+CSS.escape(n)+'"]').checked,monthlyCost:document.querySelector('[data-sub-cost="'+CSS.escape(n)+'"]').value}});localStorage.setItem(SUBS_KEY,JSON.stringify(obj));toast("Streaming costs saved on this device");render();syncPush()}
function renderStreamingInsights(){
 const watched={},loved={};
 allShows().filter(s=>s.watched===true).forEach(s=>(s.watchedOn||[]).forEach(p=>{watched[p]=(watched[p]||0)+1;if(s.rating==="Loved")loved[p]=(loved[p]||0)+1}));
 const rec={};rankedCandidates(allShows().filter(s=>!PREVIEW.has(s.title)),buildProfile(allShows())).filter(x=>eligible(x.s.title,x.m)).slice(0,60).forEach(({s})=>{const p=(tm(s.title)||{}).providers||{};new Set([...(p.stream||[]),...(p.free||[]),...(p.ads||[])].map(x=>serviceFor(x.name)||x.name)).forEach(n=>{rec[n]=(rec[n]||0)+1})});
 const names=[...new Set([...Object.keys(watched),...Object.keys(rec)])].sort((a,b)=>((watched[b]||0)+(rec[b]||0))-((watched[a]||0)+(rec[a]||0))||a.localeCompare(b));
 const rows=names.map(n=>'<tr><td>'+esc(n)+'</td><td style="text-align:right">'+(watched[n]||0)+'</td><td style="text-align:right">'+(loved[n]||0)+'</td><td style="text-align:right">'+(rec[n]||0)+'</td></tr>').join('');
 const totalRecorded=Object.values(watched).reduce((a,b)=>a+b,0),totalRec=Object.values(rec).reduce((a,b)=>a+b,0);
 const subs=getSubscriptions();
 const activeCost=subs.filter(x=>x.active&&x.monthlyCost!=="").reduce((n,x)=>n+(Number(x.monthlyCost)||0),0);
 const costRows=subs.map(x=>`<tr><td>${esc(x.name)}</td><td><input type="checkbox" data-sub-active="${esc(x.name)}" ${x.active?"checked":""}></td><td><input class="field" style="width:92px;padding:6px" type="number" min="0" step="0.01" placeholder="$/mo" data-sub-cost="${esc(x.name)}" value="${esc(x.monthlyCost||"")}"></td><td style="text-align:right">${watched[x.name]||0}</td><td style="text-align:right">${loved[x.name]||0}</td><td style="text-align:right">${rec[x.name]||0}</td><td style="text-align:right">${x.active&&Number(x.monthlyCost)>0&&loved[x.name]?("$"+(Number(x.monthlyCost)/loved[x.name]).toFixed(2)):"—"}</td></tr>`).join("");
 return `${heading("Streaming Insights","Where your watched favorites come from—and where your next discoveries are available.")}<div class="facts"><div class="fact"><small>Watched platform records</small><strong>${totalRecorded}</strong></div><div class="fact"><small>Platform-title recommendations</small><strong>${totalRec}</strong></div><div class="fact"><small>Current monthly spend entered</small><strong>$${activeCost.toFixed(2)}</strong></div></div><div style="overflow-x:auto"><table class="insights-table" style="width:100%;border-collapse:collapse;margin:12px 0"><thead><tr><th style="text-align:left">Platform</th><th>Watched</th><th>Loved</th><th>Recommended</th></tr></thead><tbody>${rows||'<tr><td colspan="4">No platform research or viewing records yet.</td></tr>'}</tbody></table></div><h3 style="margin:24px 0 6px">Subscription value tracker</h3><p style="color:var(--muted);font-size:13px">Enter your actual monthly prices (including the plan/tax you pay). This compares your cost with the number of Loved shows watched and the current recommendation pipeline.</p><div style="overflow-x:auto"><table class="insights-table" style="width:100%;border-collapse:collapse"><thead><tr><th>Service</th><th>Subscribed</th><th>Monthly $</th><th>Watched</th><th>Loved</th><th>Recommended</th><th>Cost / Loved</th></tr></thead><tbody>${costRows}</tbody></table></div><button class="btn primary" id="saveSubs" style="margin-top:12px">Save subscription details</button><div class="note">Cost per Loved show is a simple directional metric: monthly service price divided by the number of Loved shows you've recorded watching there. It is not a true per-show cost calculation, since viewing spans months and some shows are available on multiple services. Counts only include platform data you enter; historical viewing services are not guessed. Recommendation counts include researched eligible For You titles, regardless of whether you subscribe. A show available on multiple services counts under each one.</div>`;
}
function renderRatingPanel(research,t){
 const imdb=String(research.imdb||"").match(/(\d+(?:\.\d+)?)\s*\/\s*10/);
 const rt=String(research.rt||"");
 const scores=rt.match(/(\d{1,3})%\s*critic\s*\/\s*(\d{1,3})%\s*audience/i);
 const tom=rt.match(/(\d{1,3})%\s*(?:critic|tomatometer)/i);
 const pop=rt.match(/(\d{1,3})%\s*(?:audience|popcornmeter)/i);
 const imdbValue=imdb?imdb[1]+"/10":"Not verified";
 const imdbCount=String(research.imdb||"").match(/\(([^)]+)\)/);
 return '<section class="score-panel"><div class="score-grid"><div class="score-card imdb-card"><div class="score-brand"><span class="imdb-mark">IMDb</span><span>IMDb rating</span></div>'+(imdb?stars(imdb[1]):'')+'<strong class="'+(imdb?'score-value':'score-unavailable')+'">'+esc(imdb?imdbValue:'Not yet verified')+'</strong>'+(imdbCount?'<small>'+esc(imdbCount[1])+(/ratings?$/i.test(imdbCount[1])?'':' ratings')+'</small>':!imdb&&t&&t.imdb?'<small><a href="https://www.imdb.com/title/'+esc(t.imdb)+'/" target="_blank" rel="noopener">View on IMDb</a></small>':'<small>Community rating</small>')+'</div><div class="score-card rt-card"><div class="score-brand"><span class="rt-mark">🍅 RT</span><span>Rotten Tomatoes</span></div>'+(scores?'<div class="rt-scores"><div><strong>'+esc(scores[1])+'%</strong><small>Tomatometer</small></div><div><strong>'+esc(scores[2])+'%</strong><small>Audience</small></div></div>':(tom||pop?'<div class="rt-scores">'+(tom?'<div><strong>'+esc(tom[1])+'%</strong><small>Tomatometer</small></div>':'')+(pop?'<div><strong>'+esc(pop[1])+'%</strong><small>Audience</small></div>':'')+'</div>':'<strong class="score-unavailable">Not yet verified</strong>'))+'</div>'+renderMetascore(research.metascore)+'</div></section>';
}
function renderMetascore(m){
 const head='<div class="score-brand"><span class="mc-mark">M</span><span>Metascore</span></div>';
 if(!m)return '<div class="score-card mc-card">'+head+'<strong class="score-unavailable">Not yet verified</strong></div>';
 if(m.score==null)return '<div class="score-card mc-card">'+head+'<strong class="score-unavailable">'+esc(m.status||"Not yet verified")+'</strong>'+(m.url?'<small><a href="'+esc(m.url)+'" target="_blank" rel="noopener">View on Metacritic</a></small>':'')+'</div>';
 const tone=m.score>=61?"good":m.score>=40?"mixed":"bad",label=m.score>=61?"Generally favorable":m.score>=40?"Mixed or average":"Generally unfavorable";
 return '<div class="score-card mc-card"><a class="mc-link" href="'+esc(m.url)+'" target="_blank" rel="noopener">'+head+'<span class="mc-score '+tone+'">'+esc(m.score)+'</span><small>'+label+' · '+esc(m.reviews)+' critic reviews</small></a></div>';
}
function renderStreamBadges(research){
 const subs=getSubscriptions();
 const free=["Tubi","The Roku Channel","Plex"];
 const providers=Array.isArray(research.platforms)?research.platforms:[];
 if(!providers.length)return '<div class="stream-chip unknown">Availability not verified</div>';
 const groups={included:[],free:[],other:[]};
 providers.forEach(p=>{
  const base=p.replace(/\s*\(.*?\)/g,"").trim().toLowerCase(),notes=(p.match(/\((.*?)\)/g)||[]).join(" ").toLowerCase();
  const isFree=free.some(x=>x.toLowerCase()===base)||/\bfree\b/.test(notes);
  const active=subs.some(x=>x.active&&x.name.toLowerCase().split(/\s*\/\s*/).concat(x.name.toLowerCase()).includes(base));
  const isBuy=/purchase|buy|rent/.test(notes);
  const status=isFree?"Free / ad-supported":active?"Included in your subscriptions":isBuy?"Buy / rent":"Not in your subscriptions";
  const cls=isFree?"free":active?"included":"other";
  groups[cls].push('<div class="stream-chip '+cls+'"><span class="stream-icon" aria-hidden="true">'+esc(initials(p))+'</span><div><strong>'+esc(p)+'</strong><small>'+status+'</small></div></div>');
 });
 return [["included","Your streaming services"],["free","Free streaming"],["other","Other streaming services"]].filter(([k])=>groups[k].length).map(([k,t])=>'<div class="watch-group"><h4>'+t+'</h4>'+groups[k].join("")+'</div>').join("");
}
// ── Where to Watch (TMDB / JustWatch data, falling back to researched platforms) ──
const SUB_MATCH=[["Netflix",/^netflix/],["Hulu",/^hulu/],["Disney+",/^disney/],["Max",/^(hbo )?max\b/],["Peacock",/^peacock/],["Paramount+",/^paramount/],["Apple TV+",/^apple tv( plus|\+)?$/],["YouTube TV",/^youtube tv/],["Prime Video",/^amazon prime video$|^amazon prime video with ads$/],["BritBox",/^brit ?box/],["Acorn TV",/^acorn ?tv/],["PBS / PBS Passport",/^pbs( passport)?$/],["BBC Select",/^bbc select/],["The Roku Channel",/^the roku channel/],["Tubi",/^tubi/],["Plex",/^plex/]];
function serviceFor(name){const n=String(name).toLowerCase().replace(/\s+(amazon channel|apple tv channel|roku premium channel)$/,"").trim();const m=SUB_MATCH.find(([,re])=>re.test(n));return m?m[0]:null}
function providerRow(name,logo,status,cls){return '<div class="stream-chip '+cls+'">'+(logo?'<img class="stream-logo" src="'+img(logo,"w92")+'" alt="" loading="lazy" crossorigin="anonymous">':'<span class="stream-icon" aria-hidden="true">'+esc(initials(name))+'</span>')+'<div><strong>'+esc(name)+'</strong><small>'+esc(status)+'</small></div></div>'}
function renderWhere(r,t){
 const p=t&&t.providers;
 const any=p&&(p.stream.length||p.free.length||p.ads.length||p.buy.length||p.rent.length);
 if(!any)return r?renderStreamBadges(r):'<div class="stream-chip unknown">Availability not verified</div>';
 const active=new Set(getSubscriptions().filter(x=>x.active).map(x=>x.name)),seen=new Set(),yours=[],free=[],other=[],buy=[];
 const add=(list,pr,label,status,cls)=>{if(seen.has(label))return;seen.add(label);list.push(providerRow(label,pr.logo,status,cls))};
 p.stream.forEach(pr=>{const sv=serviceFor(pr.name);if(sv&&active.has(sv))add(yours,pr,sv,"Included in your subscriptions","included");});
 [...p.free,...p.ads].forEach(pr=>add(free,pr,serviceFor(pr.name)||pr.name,"Free / ad-supported","free"));
 p.stream.forEach(pr=>{const sv=serviceFor(pr.name);if(!(sv&&active.has(sv)))add(other,pr,sv||pr.name,"Subscription","other")});
 [...p.buy,...p.rent].forEach(pr=>add(buy,pr,pr.name,"Buy / rent","other"));
 const group=(title,rows,max)=>rows.length?'<div class="watch-group"><h4>'+title+'</h4>'+rows.slice(0,max).join("")+(rows.length>max?'<div class="more-providers">+ '+(rows.length-max)+' more</div>':'')+'</div>':'';
 return group("Your streaming services",yours,8)+group("Free streaming",free,4)+group("Other streaming services",other,4)+group("Buy or rent",buy,3)
  +'<p class="provider-credit">U.S. availability from <a href="'+esc(p.link||"https://www.justwatch.com/us")+'" target="_blank" rel="noopener">JustWatch</a> via TMDB. Catalogs change; confirm on the service before watching.</p>';
}
function statusText(t){if(!t||!t.status)return "";const end=t.endYear?" ("+t.endYear+")":"";return t.status==="Ended"?"Ended"+end:t.status==="Canceled"?"Canceled"+end:t.status==="Returning Series"?"Still running":t.status}
function factList(rows){return '<div class="facts">'+rows.filter(([,v])=>v).map(([k,v])=>'<div class="fact"><small>'+esc(k)+'</small><strong>'+esc(v)+'</strong></div>').join("")+'</div>'}

function renderDetail(){
 let s=getShow(currentTitle);if(!s){render();return}
 const r=RESEARCH[s.title],t=tm(s.title),[c1,c2]=art(s.title),bd=t?img(t.backdrop,"w1280"):"";
 const ended=t&&["Ended","Canceled"].includes(t.status);
 const years=t&&t.year?t.year+(ended?(t.endYear&&t.endYear!==t.year?"–"+t.endYear:""):"–present"):"";
 const meta=[...(r?shortMeta(r):[t&&t.genres[0],t&&t.rating]),years,t&&t.seasons?t.seasons+(t.seasons===1?" season":" seasons"):""].filter(Boolean);
 const about=(r&&r.synopsis)||(t&&t.overview)||"";
 let facts,note;
 if(r){
  facts=factList([["Streaming services listed",r.availability],["Seasons",r.seasons],["Series status",statusText(t)],["Cast / presenters",r.cast],["Genre",r.genre],["Content guidance",r.rating+". "+r.cautions],["Why SwordsTV surfaced it",r.why],["Last checked",r.checked]]);
  note=`<div class="note">Research sources: ${r.sources.map(x=>`<a href="${esc(x[1])}" target="_blank" rel="noopener">${esc(x[0])}</a>`).join(" · ")}${t?' · Images and series details from <a href="https://www.themoviedb.org/tv/'+t.id+'" target="_blank" rel="noopener">TMDB</a>':""}. Streaming rights and catalogs can change; confirm on the service before watching.</div>`;
 }else if(t){
  facts=factList([["Seasons",t.seasons?t.seasons+" seasons · "+t.episodes+" episodes":""],["Series status",statusText(t)],["Cast / presenters",t.cast.join(", ")||"Not listed"],["Genre",t.genres.join(", ")],["Network",t.networks.map(n=>n.name).join(", ")],["U.S. content rating",t.rating||"Not listed"],["TMDB audience score",t.tmdbScore&&!SCORES[s.title]?t.tmdbScore+"/10":""],["Content guidance",DISCOVERED[s.title]?DISCOVERED[s.title].guidance.notes:GUIDANCE[s.title]?(GUIDANCE[s.title].status==="blocked"?"Not recommended for the family: ":"")+GUIDANCE[s.title].notes:ADDED[s.title]||PREVIEW.has(s.title)?"Checked with tonight's update":"Not yet verified; not cleared for recommendation"]]);
  note=`<div class="note">Details and images from <a href="https://www.themoviedb.org/tv/${t.id}" target="_blank" rel="noopener">TMDB</a>.${scoreSources(s.title,t)} ${PREVIEW.has(s.title)?" Rate it or add it to My Queue to add it to your shows. IMDb, Rotten Tomatoes and Metacritic scores and content notes are added with the nightly update.":ADDED[s.title]&&!SCORES[s.title]?` Added by your family on ${esc(ADDED[s.title].addedOn)}. IMDb, Rotten Tomatoes and Metacritic scores and content notes arrive with tonight's update.`:DISCOVERED[s.title]?` Found by the nightly search on ${esc(DISCOVERED[s.title].addedOn)} and checked against your content limits on ${esc(DISCOVERED[s.title].guidance.reviewed||DISCOVERED[s.title].addedOn)}.`:(GUIDANCE[s.title]&&GUIDANCE[s.title].status==="ok"?` Content checked against your limits on ${esc(GUIDANCE[s.title].reviewed)}.`:GUIDANCE[s.title]&&GUIDANCE[s.title].status==="blocked"?" Content-checked and not recommended for the family, so it won't appear on For You.":" Not content-reviewed yet, so it isn't recommended on For You until the nightly review clears it.")}</div>`;
 }else{
  facts=factList([["Where to stream","Not yet verified"],["Seasons","Not yet verified"],["Cast / presenters","Not yet verified"],["Genre / synopsis","Research pending"],["Content guidance","Not yet verified; not cleared for recommendation"]]);
  note=ADDED[s.title]?`<div class="note">Added by name on ${esc(ADDED[s.title].addedOn)}. Poster, details and scores arrive with tonight's update.</div>`:`<div class="note">This title has not yet been researched. Your subscription list is not a confirmation that this show is available on those services.</div>`;
 }
 document.getElementById("main").innerHTML=`<button class="back" id="backBtn">‹ Back</button><section class="show-detail">
<div class="detail-hero${bd?" has-bd":""}" style="--c1:${c1};--c2:${c2}${bd?`;--bd:url(${bd})`:""}"><div class="detail-poster">${poster(s)}</div><div class="detail-heading">${meta.length?`<div class="meta-line">${meta.map(esc).join('<span class="dot">·</span>')}</div>`:""}<h2>${esc(s.title)}</h2><div class="service-row"><span class="pill gold">${esc(shownRating(s))}</span>${listLabel(s)!=="Not on a list"?`<span class="pill">${esc(listLabel(s))}</span>`:""}<span class="pill">${s.watched?"Watched":"Not watched"}</span></div></div></div>
${contentTags(s)}<div class="detail-actions"><button class="btn primary" id="rateThis">✦ Rate It</button><div class="list-pick"><span>My Queue</span><div class="seg">${["Up Next","Watching","Want to Watch"].map(v=>`<button type="button" class="${s.libraryStatus===v?"on":""}" data-list="${v}" aria-pressed="${s.libraryStatus===v}">${s.libraryStatus===v?"✓ ":""}${v}</button>`).join("")}</div></div>${s.libraryStatus==="Watching"?`<div class="done-ask"><span>${isOngoing(s)?"Caught up on all the seasons so far?":"Finished watching it?"}</span><button class="btn" id="markCompleted">${isOngoing(s)?"Yes, I’m caught up":"Yes, mark as watched"}</button></div>`:""}</div>
${(()=>{if(s.rating in RATING_WEIGHT||s.watched)return "";const w=whyText(matchShow(s.title,buildProfile(allShows())));const snz=(s.snoozeUntil||0)>Date.now();return `<div class="why-card">${w?`<strong>Why it's for you</strong>${esc(w)}`:""}<div class="pick-actions"><button type="button" data-hide="later" class="${snz?"on":""}" aria-pressed="${snz}">${snz?"✓ Later (until "+new Date(s.snoozeUntil).toLocaleDateString("en-US",{month:"short",day:"numeric"})+")":"Later"}</button><button type="button" data-hide="no" class="${s.dismissed?"on":""}" aria-pressed="${!!s.dismissed}">${s.dismissed?"✓ Not interested":"Not interested"}</button></div></div>`})()}<div class="detail-content">
<div class="card"><h3 class="card-title">Where to Watch</h3>${renderWhere(r,t)}</div>
<div class="card"><h3 class="card-title">Ratings &amp; Reviews</h3>${renderRatingPanel(r||scoreResearch(s.title),t)}</div>
<div class="card"><h3 class="card-title">About this Show</h3>${about?`<p class="about-text">${esc(about)}</p>`:""}${facts}</div>
${note}</div></section>`;
 document.getElementById("backBtn").onclick=()=>{currentView=previousView;render();window.scrollTo(0,previousScroll)};
 syncWelcome();bindRecActions();
 document.getElementById("rateThis").onclick=()=>openRate(s.title);
 document.querySelectorAll("[data-list]").forEach(b=>b.onclick=()=>{const v=b.dataset.list,on=getShow(s.title).libraryStatus===v,ls=on?"Not in My Library":v;saveChange(s.title,{libraryStatus:ls,status:ls,...(on?{}:{dismissed:false,snoozeUntil:0})},{msg:on?"Removed from My Queue":"Added to "+v})});
 document.querySelectorAll("[data-hide]").forEach(b=>b.onclick=()=>{const cur=getShow(s.title);if(b.dataset.hide==="later"){const on=(cur.snoozeUntil||0)>Date.now();saveChange(s.title,{snoozeUntil:on?0:Date.now()+SNOOZE_DAYS*864e5,...(on?{}:{dismissed:false})},{msg:on?"It can be suggested again":`Hidden for ${SNOOZE_DAYS} days`})}else{const on=!!cur.dismissed;saveChange(s.title,{dismissed:!on,...(on?{}:{snoozeUntil:0,libraryStatus:"Not in My Library",status:"Not in My Library"})},{msg:on?"It can be suggested again":"Won't suggest it again"})}});
 
 const mc=document.getElementById("markCompleted");if(mc)mc.onclick=()=>{saveChange(s.title,{completed:true,watched:true,libraryStatus:"Not in My Library",status:"Not in My Library"});if(!RATINGS.includes(getShow(s.title).rating))openRate(s.title);else toast("Moved to My Library")};
}
function bindRecActions(){document.querySelectorAll(".rec-actions button").forEach(b=>b.onclick=e=>{e.stopPropagation();const host=b.closest("[data-title]");recAction(host?host.dataset.title:currentTitle,b.dataset.act)})}
function render(){document.getElementById("main").innerHTML=currentView==="search"?renderSearch():currentView==="home"?renderHome():currentView==="library"?renderLibrary():currentView==="watchlist"?renderWatchlist():renderProfile();document.querySelectorAll(".show").forEach(el=>el.onclick=()=>openDetail(el.dataset.title));document.querySelectorAll("[data-title]:not(.show)").forEach(el=>el.onclick=()=>openDetail(el.dataset.title));if(currentView==="library"){let q=document.getElementById("search");q.oninput=e=>{searchTerm=e.target.value;let pos=q.selectionStart;render();let n=document.getElementById("search");n.focus();n.setSelectionRange(pos,pos)};let f=document.getElementById("ratingFilter");f.value=ratingFilter;f.onchange=e=>{ratingFilter=e.target.value;render()}}let sb=document.getElementById("saveSubs");if(sb)sb.onclick=saveSubscriptions;syncWelcome();;if(currentView==="search")bindSearch();document.getElementById("searchBtn").classList.toggle("active",currentView==="search");bindRecActions();document.querySelectorAll("[data-unhide]").forEach(b=>b.onclick=()=>saveChange(b.dataset.unhide,{dismissed:false,snoozeUntil:0},{msg:"It can be suggested again"}))}
function saveChange(title,obj,opts){adoptShow(title);const before=getShow(title);if(before&&obj.completed===undefined){if(obj.libraryStatus==="Watching"&&isOngoing(before))obj={...obj,completed:false};else if(isCompleted(before)&&obj.watched!==false)obj={...obj,completed:true}}changes[title]={...(changes[title]||{}),...obj,_t:Date.now()};localStorage.setItem(STORAGE,JSON.stringify(changes));syncPush();toast((opts&&opts.msg)||(SYNC.user?"Saved for the family":"Saved to this device"),opts&&opts.undo);if(currentView==="detail")renderDetail();else render()}
// Rate dialog: three plain questions. Watched it / Watching now / Not yet; then either
// How was it? (Loved…Disliked, No rating) or Want to watch it? (Up Next, Want to Watch, Maybe later, Not interested).
const RATE={};
function pick(group,v){RATE[group]=v;document.querySelectorAll(`.chips[data-group="${group}"] button`).forEach(b=>b.classList.toggle("on",b.dataset.v===v));if(group==="watch")syncRateQuestions()}
function syncRateQuestions(){const seen=RATE.watch!=="not";document.getElementById("qRating").hidden=!seen;document.getElementById("qWhere").hidden=!seen;document.getElementById("qPlan").hidden=seen}
function openRate(title){currentTitle=title;const s=getShow(title),run=isOngoing(s);
 document.getElementById("modalTitle").textContent=title;
 document.getElementById("optWatched").textContent=run?"Caught up":"Watched it";
 document.getElementById("qWatchLabel").textContent=run?"Have you watched it? (still running)":"Have you watched it?";
 pick("watch",s.libraryStatus==="Watching"?"watching":(s.watched||inLibrary(s))?"watched":"not");
 pick("rating",RATINGS.includes(s.rating)?s.rating:"Not rated");
 pick("plan",s.libraryStatus==="Up Next"?"next":s.libraryStatus==="Want to Watch"?"want":s.dismissed?"no":"none");
 document.getElementById("seasons").value=s.seasonsWatched||"";
 document.querySelectorAll('input[name="watchedOn"]').forEach(c=>c.checked=(s.watchedOn||[]).includes(c.value));
 document.getElementById("rateBg").style.display="flex"}
document.querySelectorAll("#rateForm .chips button").forEach(b=>b.onclick=()=>pick(b.closest(".chips").dataset.group,b.dataset.v));
let toastTimer=null;
function toast(msg,undo){let t=document.getElementById("toast");t.textContent=msg;if(undo){const b=document.createElement("button");b.className="toast-undo";b.textContent="Undo";b.onclick=()=>{t.style.display="none";undo()};t.appendChild(b)}t.style.display="flex";clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.style.display="none",undo?5000:2200)}
document.getElementById("rateForm").onsubmit=e=>{e.preventDefault();const w=RATE.watch;let obj;
 if(w==="not"){const ls={next:"Up Next",want:"Want to Watch"}[RATE.plan]||"Not in My Library";
  obj={watched:false,completed:false,rating:"Not rated",libraryStatus:ls,status:ls,dismissed:RATE.plan==="no",snoozeUntil:0,seasonsWatched:"",watchedOn:[]}}
 else{const ls=w==="watching"?"Watching":"Not in My Library";
  obj={watched:w==="watched",completed:w==="watched",rating:RATE.rating,libraryStatus:ls,status:ls,dismissed:false,snoozeUntil:0,seasonsWatched:document.getElementById("seasons").value,watchedOn:[...document.querySelectorAll('input[name="watchedOn"]:checked')].map(c=>c.value)}}
 const msg=w==="not"?({next:"Added to Up Next",want:"Added to Want to Watch",no:"Won't suggest it again",none:"Marked not watched"})[RATE.plan]:w==="watching"?"In My Queue as Watching":RATINGS.includes(RATE.rating)?"Saved to My Library":"Marked watched";
 saveChange(currentTitle,obj,{msg});document.getElementById("rateBg").style.display="none";if(currentView==="detail")renderDetail()};
document.getElementById("cancelRate").onclick=()=>document.getElementById("rateBg").style.display="none";
document.getElementById("nav").onclick=e=>{let b=e.target.closest("button[data-view]");if(!b)return;currentView=b.dataset.view;document.querySelectorAll(".nav button").forEach(x=>x.classList.toggle("active",x===b));render();window.scrollTo(0,0)};
document.getElementById("browseBtn").onclick=()=>{currentView="library";document.querySelectorAll(".nav button").forEach(x=>x.classList.toggle("active",x.dataset.view==="library"));render();window.scrollTo(0,0)};
document.getElementById("exportBtn").onclick=()=>{let backup={project:DATA.project,changes,roundHistory:DATA.roundHistory,subscriptions:JSON.parse(localStorage.getItem(SUBS_KEY)||"{}")};let blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});let a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="SwordsTV-backup.json";a.click();URL.revokeObjectURL(a.href)};
document.getElementById("syncBtn").onclick=()=>syncSignIn();
document.getElementById("searchBtn").onclick=()=>openSearch();
document.getElementById("importBtn").onclick=()=>document.getElementById("importFile").click();
document.getElementById("importFile").onchange=async e=>{let f=e.target.files[0];if(!f)return;try{let d=JSON.parse(await f.text());if(d.changes){changes={...changes,...Object.fromEntries(Object.entries(d.changes).map(([k,v])=>[k,{...v,_t:Date.now()}]))};localStorage.setItem(STORAGE,JSON.stringify(changes));syncPush();if(d.subscriptions)localStorage.setItem(SUBS_KEY,JSON.stringify(d.subscriptions));toast("Backup imported");render()}else toast("That file is not a SwordsTV backup")}catch{toast("Could not read backup file")}};
function showLoadError(){document.getElementById("main").innerHTML='<div class="empty">SwordsTV couldn\'t load its show data. Check your connection and reload the page.</div>'}
function loadJSON(url){return fetch(url,{cache:"no-cache"}).then(r=>{if(!r.ok)throw new Error(url+" "+r.status);return r.json()})}
Promise.all([loadJSON("data.json"),loadJSON("shows.json").catch(()=>({})),loadJSON("tmdb.json").catch(()=>({})),loadJSON("scores.json").catch(()=>({})),loadJSON("discoveries.json").catch(()=>({})),loadJSON("app-config.json").catch(()=>({})),loadJSON("guidance.json").catch(()=>({}))]).then(([d,r,t,sc,dc,cfg,gd])=>{DATA=d;RESEARCH=r;TMDB=t.shows||{};SCORES=sc.shows||{};SCORES_CHECKED=sc.checked||"";APP_CONFIG=cfg||{};GUIDANCE=(gd&&gd.shows)||{};addDiscoveries(dc);loadAddedShows();render();syncStart()}).catch(showLoadError);
if("serviceWorker" in navigator && location.protocol.startsWith("http")){window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));}
