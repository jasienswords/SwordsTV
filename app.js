let DATA=null,RESEARCH={},TMDB={},SCORES={};
const IMG="https://image.tmdb.org/t/p/";
const img=(p,size)=>p?IMG+size+p:"";
const tm=t=>TMDB[t]||null;
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
function allShows(){return DATA.catalog.map(x=>{let c=changes[x.title]||{},legacyStatus=x.status||"Unwatched";return {...x,...c,seriesComplete:c.seriesComplete??["Ended","Canceled"].includes((TMDB[x.title]||{}).status),libraryStatus:c.libraryStatus??(["Watching","Want to Watch"].includes(c.status)?c.status:["Watching","Want to Watch"].includes(legacyStatus)?legacyStatus:"Not in My Library"),watched:c.watched??(c.status==="Watched"||legacyStatus==="Watched"),status:c.libraryStatus??(["Watching","Want to Watch"].includes(c.status)?c.status:["Watching","Want to Watch"].includes(legacyStatus)?legacyStatus:"Not in My Library")}}).sort((a,b)=>a.title.localeCompare(b.title))}
function getShow(t){return allShows().find(x=>x.title===t)}
function art(title){let h=0;for(let c of title)h=(h*31+c.charCodeAt(0))>>>0;return colors[h%colors.length]}
function poster(s,small=false){let [a,b]=art(s.title),t=tm(s.title),src=t&&img(t.poster,"w342");return `<div class="poster${src?" has-img":""}" style="--c1:${a};--c2:${b}">${src?`<img class="poster-img" src="${src}" alt="" loading="lazy" decoding="async" crossorigin="anonymous" onerror="this.parentNode.classList.remove('has-img');this.remove()">`:""}<span class="tag r-${({Loved:"loved",Liked:"liked",Okay:"okay",Disliked:"disliked"})[s.rating]||"none"}">${esc(shownRating(s))}</span><div class="poster-title">${esc(s.title)}</div></div>`}
function card(s){return `<article class="show" data-title="${esc(s.title)}">${poster(s)}<div class="show-meta"><strong>${esc(s.title)}</strong><span>${esc(shownRating(s))} · ${esc(s.status||"Unwatched")}</span></div></article>`}
const RATINGS=["Loved","Liked","Okay","Disliked"];
function shownRating(s){return RATINGS.includes(s.rating)?s.rating:"Not rated"}
function shortMeta(r){if(!r)return [];const g=String(r.genre||"").split("/")[0].trim(),cr=String(r.rating||"").match(/\b(TV-(?:Y7|Y|G|PG|14|MA)|PG-13|PG|G|R)\b/);return [g,cr&&cr[1]].filter(Boolean)}
function stars(v){const n=Math.max(0,Math.min(10,Math.round(Number(v)||0)));return '<div class="stars" aria-hidden="true">'+"★".repeat(n)+'<span class="off">'+"★".repeat(10-n)+'</span></div>'}
function initials(name){const w=String(name).replace(/\(.*?\)/g,"").split(/[^A-Za-z0-9+]+/).filter(Boolean);return (w.length>1?w[0][0]+w[1][0]:String(w[0]||"?").slice(0,2)).toUpperCase()}
function heading(title,sub=""){return `<div class="section-head"><div><h3>${title}</h3>${sub?`<p>${sub}</p>`:""}</div></div>`}
let previousView="home",previousScroll=0;
function syncWelcome(){let w=document.querySelector(".welcome");if(w)w.classList.toggle("hidden",currentView!=="home")}
function openDetail(title){if(currentView!=="detail"){previousView=currentView;previousScroll=window.scrollY}currentTitle=title;currentView="detail";renderDetail();window.scrollTo(0,0)}
function renderHome(){
 const all=allShows(), byTitle=new Map(all.map(x=>[x.title,x]));
 const watchedOrRated=s=>s.watched===true||["Loved","Liked","Okay","Disliked"].includes(s.rating);
 const seen=new Set();
 const rows=[
  {name:"Because you loved…",sub:"Unwatched possibilities inspired by the shows your family already enjoys.",titles:["The Durrells in Corfu","Trying","Detectorists","The Outlaws","The Goes Wrong Show","Stath Lets Flats","The Cockfields","The Royle Family"]},
  {name:"British Favorites",sub:"Distinctive places, warm personalities and British storytelling.",titles:["Great British Railway Journeys","Great British Railway Journeys: Australia","Great British Home Restoration","The Great British Garden Revival","Escape to the Country","The Great British Sewing Bee","The Great British Food Revival","The Great British Menu","The Repair Shop","Restoration Home","Great British Home Restoration","Escape to the Country"]},
  {name:"Smart Comedies",sub:"Clever, character-led comedy rather than bleak or mean-spirited humor.",titles:["Better Off Ted","Trial & Error","Black-ish","Home Economics","The Mindy Project","Life in Pieces","The Middle","Raising Hope","Speechless","The Kids in the Hall"]},
  {name:"Travel & Exploration",sub:"A change of scenery, curious hosts and places worth discovering.",titles:["The Reluctant Traveler","Travel Man","Rick Steves' Europe","Down to Earth with Zac Efron","The World's Most Extraordinary Homes","Somebody Feed Phil","Long Way Round","Long Way Up","Around the World in 80 Days"]},
  {name:"Homes & Renovation",sub:"Welcoming homes, interesting locations and satisfying transformations.",titles:["Great British Home Restoration","Escape to the Chateau","Escape to the Chateau: DIY","Renovation Island","Renovation Resort","Farmhouse Fixer","The Nate and Jeremiah Home Project","Your Home Made Perfect","Maine Cabin Masters: Building Italy"]},
  {name:"Mysteries & Adventures",sub:"Intrigue and momentum, with tone and content still to be checked.",titles:["Queens of Mystery","The Chelsea Detective","The Last Detective","The Completely Made-Up Adventures of Dick Turpin","The Librarians","Warehouse 13","Eureka","Hooten & the Lady"]},
  {name:"Hidden Gems",sub:"Less obvious catalog picks worth a closer look.",titles:["The Great","The Indian Doctor","The Café","The Detectorists","The Goes Wrong Show","The Durrells in Corfu","The Paradise","Mr Selfridge","Blandings","The Hour"]}
 ];
 const pick=(titles)=>titles.map(t=>byTitle.get(t)).filter(s=>s&&!watchedOrRated(s)&&!seen.has(s.title)&&s.libraryStatus==="Not in My Library");
 const featureCandidates=pick(["Great British Railway Journeys","Great British Home Restoration","Better Off Ted","Queens of Mystery","The Repair Shop","Escape to the Country"]);
 const featured=featureCandidates.slice(0,3);featured.forEach(s=>seen.add(s.title));
 const intro="Recommendations start with what you love—and filter out the tones and content you want to avoid. These are discovery candidates; individual content and streaming details still need verification.";
 let html;
 if(featured.length){const f=featured[0],[c1,c2]=art(f.title),r=RESEARCH[f.title]||{},ft=tm(f.title)||{},bd=img(ft.backdrop,"w1280"),meta=[String(r.genre||"").split(/[,;/]/)[0].trim(),String((r.platforms||[])[0]||"").replace(/\s*\(.*\)/,"")||(ft.networks||[])[0]?.name].filter(Boolean);if(!r.genre&&ft.genres&&ft.genres[0])meta[0]=ft.genres[0];
  html=`<section class="spotlight${bd?" has-bd":""}" data-title="${esc(f.title)}" style="--c1:${c1};--c2:${c2}${bd?`;--bd:url(${bd})`:""}"><div class="eyebrow">Picked for the Swords family</div><h2>${esc(f.title)}</h2><div class="meta-line"><span class="badge-new">Top pick</span>${meta.map(m=>`<span class="dot">·</span><span>${esc(m)}</span>`).join("")}</div><p>${intro}</p></section>`;}
 else html=`<section class="hero"><div class="hero-content"><div class="eyebrow">Picked for the Swords family</div><h2>Find your next great show.</h2><p>${intro}</p></div></section>`;
 if(featured.length!==1){html+=heading("Featured recommendations","A first shortlist based on your interest in British factual series, smart comedy and engaging mysteries.");
 html+=featured.length?`<div class="grid rail">${featured.slice(1).map(card).join("")}</div>`:`<div class="empty">You've explored these picks. More recommendations will appear as the catalog is expanded.</div>`;}
 for(const row of rows){
   const items=pick(row.titles).slice(0,8);
   if(!items.length)continue;
   items.forEach(s=>seen.add(s.title));
   html+=heading(row.name,row.sub)+`<div class="grid rail">${items.map(card).join("")}</div>`;
 }
 const library=all.filter(s=>["Watching","Want to Watch"].includes(s.libraryStatus));
 html+=heading("Your Library","Shows you've deliberately added to Watching or Want to Watch.");
 html+=library.length?`<div class="grid rail">${library.slice(0,6).map(card).join("")}</div>`:`<div class="empty">Your Library is empty. Add a title when you decide you want to watch it.</div>`;
 html+=heading("New & Upcoming","Fresh seasons of shows already on your radar.");
 const upcoming=[
  {title:"All Creatures Great and Small (modern)",season:"Season 7",date:"January 17, 2027 · 9/8c",service:"MASTERPIECE on PBS",detail:"The new season returns to Yorkshire. PBS lists the series on pbs.org and the PBS app.",url:"https://www.pbs.org/show/all-creatures-great-and-small/"},
  {title:"Miss Scarlet",season:"Season 7 · Final season",date:"November 29, 2026 · PBS Passport early access; January 17, 2027 broadcast",service:"MASTERPIECE on PBS",detail:"The final season begins its early PBS Passport release before its broadcast premiere.",url:"https://www.pbs.org/wgbh/masterpiece/clips/miss-scarlet-s7-official-trailer/"}
 ];
 html+=`<div class="grid">${upcoming.map(u=>{let found=byTitle.get(u.title);return `<article class="show" ${found?`data-title="${esc(u.title)}"`:""}><div class="poster" style="--c1:#34465c;--c2:#8d755b"><span class="tag r-next">UP NEXT</span><div class="poster-title">${esc(u.title)}</div></div><div class="show-meta"><strong>${esc(u.title)}</strong><span>${esc(u.season)}</span><span>${esc(u.date)}</span><span>${esc(u.service)}</span><a href="${u.url}" target="_blank" rel="noopener" style="color:var(--accent);font-size:12px">Official details ↗</a><small style="color:var(--muted)">${esc(u.detail)}</small></div></article>`}).join("")}</div>`;
 html+=`<div class="note">Recommendation safeguards: titles already marked watched or rated are excluded from discovery rows. Recommendations are curated starting points, not verified content approvals. We will check tone, pacing, violence, sexual content and supernatural elements before treating a title as a strong match.</div>`;
 return html;
}
function renderLibrary(){let all=allShows().filter(s=>["Watching","Want to Watch"].includes(s.libraryStatus)&&s.title.toLowerCase().includes(searchTerm.toLowerCase()));if(ratingFilter!=="All")all=all.filter(s=>s.rating===ratingFilter);return `${heading("My Library",`${all.length} shows you've chosen to add`)}<div class="filters"><input id="search" class="field search" placeholder="Search your library…" value="${esc(searchTerm)}"><select id="ratingFilter" class="field"><option>All</option><option>Loved</option><option>Liked</option><option>Okay</option><option>Disliked</option></select></div><div class="grid">${all.map(card).join("")||`<div class="empty">Your Library is empty. Add a show as Watching or Want to Watch from its detail page.</div>`}</div>`}
function renderWatchlist(){let all=allShows(),groups={};["Loved","Liked","Okay","Disliked"].forEach(r=>groups[r]=all.filter(s=>s.rating===r&&s.watched===true&&s.seriesComplete===true));let total=Object.values(groups).reduce((n,a)=>n+a.length,0);return `${heading("Watchlist",`${total} verified completed series you've watched and rated`)}<p style="color:var(--muted);font-size:13px;margin:-4px 0 18px">Your finished-TV collection, ordered by your family's ratings. A show appears here once you have watched and rated it and TMDB lists the series as ended. Being watched does not add it to My Library.</p>${["Loved","Liked","Okay","Disliked"].map(r=>`<details ${r==="Loved"||r==="Liked"?"open":""} style="background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:14px;margin:10px 0"><summary><strong>${r}</strong> <span style="color:var(--muted)"> · ${groups[r].length} shows</span></summary><div style="margin-top:12px;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:7px">${groups[r].map(s=>`<div class="pill" data-title="${esc(s.title)}" style="justify-content:flex-start;cursor:pointer">${esc(s.title)}</div>`).join("")||`<span style="color:var(--muted);font-size:12px">No eligible shows yet. Completion status will be verified before titles are added.</span>`}</div></details>`).join("")}`;
}
function renderHistory(){
let watched=DATA.roundHistory.filter(x=>String(x.status).toLowerCase()==="watched" && x.rating && !["haven't watched","not rated","unrated"].includes(String(x.rating).toLowerCase()));
let groups={};["Loved","Liked","Okay","Disliked"].forEach(r=>groups[r]=watched.filter(x=>x.rating===r));
return `${heading("Ratings History",`${watched.length} watched-show rating records`)}<p style="color:var(--muted);font-size:13px;margin:-4px 0 18px">Only shows marked as watched appear here. Shows you haven't watched remain eligible for recommendations.</p>${["Loved","Liked","Okay","Disliked"].map(r=>`<details ${r==="Loved"||r==="Liked"?"open":""} style="background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:14px;margin:10px 0"><summary><strong>${r}</strong> <span style="color:var(--muted)"> · ${groups[r].length} shows</span></summary><div style="margin-top:12px;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:7px">${groups[r].map(x=>`<div class="pill" style="justify-content:flex-start">${esc(x.title)}</div>`).join("")||`<span style="color:var(--muted);font-size:12px">No shows in this category yet.</span>`}</div></details>`).join("")}`;
}

const SUBSCRIPTION_DEFAULTS=[{"name": "Netflix", "active": true, "monthlyCost": ""}, {"name": "Hulu", "active": true, "monthlyCost": ""}, {"name": "Disney+", "active": true, "monthlyCost": ""}, {"name": "Max", "active": true, "monthlyCost": ""}, {"name": "Peacock", "active": true, "monthlyCost": ""}, {"name": "Paramount+", "active": true, "monthlyCost": ""}, {"name": "Apple TV+", "active": true, "monthlyCost": ""}, {"name": "YouTube TV", "active": true, "monthlyCost": ""}, {"name": "Prime Video", "active": false, "monthlyCost": ""}, {"name": "BritBox", "active": false, "monthlyCost": ""}, {"name": "Acorn TV", "active": false, "monthlyCost": ""}, {"name": "PBS / PBS Passport", "active": false, "monthlyCost": ""}, {"name": "BBC Select", "active": false, "monthlyCost": ""}, {"name": "The Roku Channel", "active": false, "monthlyCost": ""}, {"name": "Tubi", "active": false, "monthlyCost": ""}, {"name": "Plex", "active": false, "monthlyCost": ""}];
const SUBS_KEY="swordstv_subscriptions_v1";
function getSubscriptions(){try{let saved=JSON.parse(localStorage.getItem(SUBS_KEY)||"{}");return SUBSCRIPTION_DEFAULTS.map(x=>({...x,...(saved[x.name]||{})}))}catch{return SUBSCRIPTION_DEFAULTS}}
function saveSubscriptions(){let obj={};SUBSCRIPTION_DEFAULTS.forEach(x=>{let n=x.name;obj[n]={active:document.querySelector('[data-sub-active="'+CSS.escape(n)+'"]').checked,monthlyCost:document.querySelector('[data-sub-cost="'+CSS.escape(n)+'"]').value}});localStorage.setItem(SUBS_KEY,JSON.stringify(obj));toast("Streaming costs saved on this device");render()}
function renderStreamingInsights(){
 const watched={},loved={};
 allShows().filter(s=>s.watched===true).forEach(s=>(s.watchedOn||[]).forEach(p=>{watched[p]=(watched[p]||0)+1;if(s.rating==="Loved")loved[p]=(loved[p]||0)+1}));
 const rec={};const current=allShows();[...new Set(FOR_YOU_TITLES)].forEach(t=>{let show=current.find(x=>x.title===t),r=RESEARCH[t];if(show&&show.libraryStatus==="Not in My Library"&&!show.watched&&!["Loved","Liked","Okay","Disliked"].includes(show.rating)&&r&&Array.isArray(r.platforms))r.platforms.forEach(p=>{rec[p]=(rec[p]||0)+1})});
 const names=[...new Set([...Object.keys(watched),...Object.keys(rec)])].sort((a,b)=>((watched[b]||0)+(rec[b]||0))-((watched[a]||0)+(rec[a]||0))||a.localeCompare(b));
 const rows=names.map(n=>'<tr><td>'+esc(n)+'</td><td style="text-align:right">'+(watched[n]||0)+'</td><td style="text-align:right">'+(loved[n]||0)+'</td><td style="text-align:right">'+(rec[n]||0)+'</td></tr>').join('');
 const totalRecorded=Object.values(watched).reduce((a,b)=>a+b,0),totalRec=Object.values(rec).reduce((a,b)=>a+b,0);
 const subs=getSubscriptions();
 const activeCost=subs.filter(x=>x.active&&x.monthlyCost!=="").reduce((n,x)=>n+(Number(x.monthlyCost)||0),0);
 const costRows=subs.map(x=>`<tr><td>${esc(x.name)}</td><td><input type="checkbox" data-sub-active="${esc(x.name)}" ${x.active?"checked":""}></td><td><input class="field" style="width:92px;padding:6px" type="number" min="0" step="0.01" placeholder="$/mo" data-sub-cost="${esc(x.name)}" value="${esc(x.monthlyCost||"")}"></td><td style="text-align:right">${watched[x.name]||0}</td><td style="text-align:right">${loved[x.name]||0}</td><td style="text-align:right">${rec[x.name]||0}</td><td style="text-align:right">${x.active&&Number(x.monthlyCost)>0&&loved[x.name]?("$"+(Number(x.monthlyCost)/loved[x.name]).toFixed(2)):"—"}</td></tr>`).join("");
 return `${heading("Streaming Insights","Where your watched favorites come from—and where your next discoveries are available.")}<div class="facts"><div class="fact"><small>Watched platform records</small><strong>${totalRecorded}</strong></div><div class="fact"><small>Platform-title recommendations</small><strong>${totalRec}</strong></div><div class="fact"><small>Current monthly spend entered</small><strong>$${activeCost.toFixed(2)}</strong></div></div><div style="overflow-x:auto"><table class="insights-table" style="width:100%;border-collapse:collapse;margin:12px 0"><thead><tr><th style="text-align:left">Platform</th><th>Watched</th><th>Loved</th><th>Recommended</th></tr></thead><tbody>${rows||'<tr><td colspan="4">No platform research or viewing records yet.</td></tr>'}</tbody></table></div><h3 style="margin:24px 0 6px">Subscription value tracker</h3><p style="color:var(--muted);font-size:13px">Enter your actual monthly prices (including the plan/tax you pay). This compares your cost with the number of Loved shows watched and the current recommendation pipeline.</p><div style="overflow-x:auto"><table class="insights-table" style="width:100%;border-collapse:collapse"><thead><tr><th>Service</th><th>Subscribed</th><th>Monthly $</th><th>Watched</th><th>Loved</th><th>Recommended</th><th>Cost / Loved</th></tr></thead><tbody>${costRows}</tbody></table></div><button class="btn primary" id="saveSubs" style="margin-top:12px">Save subscription details</button><div class="note">Cost per Loved show is a simple directional metric: monthly service price divided by the number of Loved shows you've recorded watching there. It is not a true per-show cost calculation, since viewing spans months and some shows are available on multiple services. Counts only include platform data you enter; historical viewing services are not guessed. Recommendation counts include researched eligible For You titles, regardless of whether you subscribe. A show available on multiple services counts under each one.</div>`;
}
function renderProfile(){return `${heading("Your family's taste profile","The working recommendation signals captured so far.")}${DATA.tasteProfile.map(x=>`<div class="fact" style="margin:8px 0"><small>${esc(x.dimension)}</small><strong>${esc(x.profile)}</strong></div>`).join("")}${renderStreamingInsights()}<div class="note">To install on iPhone: open the hosted SwordsTV link in Safari, tap Share, then Add to Home Screen. Hosting over HTTPS is required for the app-like install and offline cache.</div><div class="note">Content guardrails: avoid bleak or hopeless tone, excessive gore or disturbing violence, heavy sexual content, very slow pacing, and too much supernatural/fantasy material.</div>`}
const FOR_YOU_TITLES=["Great British Railway Journeys", "The Great British Railway Journeys: Australia", "Great British Home Restoration", "Escape to the Country", "The Great British Sewing Bee", "The Repair Shop", "The Repair Shop (UK)", "Restoration Home", "Better Off Ted", "Trial & Error", "Black-ish", "Home Economics", "The Mindy Project", "Life in Pieces", "The Middle", "Raising Hope", "Speechless", "The Reluctant Traveler", "Travel Man", "Rick Steves' Europe", "Down to Earth with Zac Efron", "The World's Most Extraordinary Homes", "Somebody Feed Phil", "Queens of Mystery", "The Chelsea Detective", "The Last Detective", "The Librarians", "Warehouse 13", "Eureka", "Hooten & the Lady", "The Great", "The Indian Doctor", "The Café", "The Detectorists", "The Goes Wrong Show", "The Durrells in Corfu", "The Paradise", "Mr Selfridge", "Blandings", "The Hour"];
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
  facts=factList([["Seasons",t.seasons?t.seasons+" seasons · "+t.episodes+" episodes":""],["Series status",statusText(t)],["Cast / presenters",t.cast.join(", ")||"Not listed"],["Genre",t.genres.join(", ")],["Network",t.networks.map(n=>n.name).join(", ")],["U.S. content rating",t.rating||"Not listed"],["Content guidance","Not yet verified; not cleared for recommendation"]]);
  note=`<div class="note">Details and images from <a href="https://www.themoviedb.org/tv/${t.id}" target="_blank" rel="noopener">TMDB</a>.${scoreSources(s.title,t)} Content guidance for this show hasn't been researched yet, so it isn't cleared for recommendation.</div>`;
 }else{
  facts=factList([["Where to stream","Not yet verified"],["Seasons","Not yet verified"],["Cast / presenters","Not yet verified"],["Genre / synopsis","Research pending"],["Content guidance","Not yet verified; not cleared for recommendation"]]);
  note=`<div class="note">This title has not yet been researched. Your subscription list is not a confirmation that this show is available on those services.</div>`;
 }
 document.getElementById("main").innerHTML=`<button class="back" id="backBtn">‹ Back</button><section class="show-detail">
<div class="detail-hero${bd?" has-bd":""}" style="--c1:${c1};--c2:${c2}${bd?`;--bd:url(${bd})`:""}"><div class="detail-poster">${poster(s)}</div><div class="detail-heading">${meta.length?`<div class="meta-line">${meta.map(esc).join('<span class="dot">·</span>')}</div>`:""}<h2>${esc(s.title)}</h2><div class="service-row"><span class="pill gold">${esc(shownRating(s))}</span><span class="pill">${esc(s.libraryStatus||"Not in My Library")}</span><span class="pill">${s.watched?"Watched":"Not watched"}</span></div></div></div>
<div class="detail-actions"><button class="btn primary" id="rateThis">✦ Rate It</button><button class="btn" id="addWatching">＋ Add as Watching</button><button class="btn" id="addWant">＋ Want to Watch</button></div>
<div class="detail-content">
<div class="card"><h3 class="card-title">Where to Watch</h3>${renderWhere(r,t)}</div>
<div class="card"><h3 class="card-title">Ratings &amp; Reviews</h3>${renderRatingPanel(r||scoreResearch(s.title),t)}</div>
<div class="card"><h3 class="card-title">About this Show</h3>${about?`<p class="about-text">${esc(about)}</p>`:""}${facts}</div>
${note}</div></section>`;
 document.getElementById("backBtn").onclick=()=>{currentView=previousView;render();window.scrollTo(0,previousScroll)};
 syncWelcome();
 document.getElementById("rateThis").onclick=()=>openRate(s.title);
 document.getElementById("addWatching").onclick=()=>saveChange(s.title,{libraryStatus:"Watching",status:"Watching"});
 document.getElementById("addWant").onclick=()=>saveChange(s.title,{libraryStatus:"Want to Watch",status:"Want to Watch"});
}
function render(){document.getElementById("main").innerHTML=currentView==="home"?renderHome():currentView==="library"?renderLibrary():currentView==="watchlist"?renderWatchlist():renderProfile();document.querySelectorAll(".show").forEach(el=>el.onclick=()=>openDetail(el.dataset.title));document.querySelectorAll("[data-title]:not(.show)").forEach(el=>el.onclick=()=>openDetail(el.dataset.title));if(currentView==="library"){let q=document.getElementById("search");q.oninput=e=>{searchTerm=e.target.value;let pos=q.selectionStart;render();let n=document.getElementById("search");n.focus();n.setSelectionRange(pos,pos)};let f=document.getElementById("ratingFilter");f.value=ratingFilter;f.onchange=e=>{ratingFilter=e.target.value;render()}}let sb=document.getElementById("saveSubs");if(sb)sb.onclick=saveSubscriptions;syncWelcome();}
function saveChange(title,obj){changes[title]={...(changes[title]||{}),...obj};localStorage.setItem(STORAGE,JSON.stringify(changes));toast("Saved to this device");if(currentView==="detail")renderDetail();else render()}
function openRate(title){currentTitle=title;let s=getShow(title);document.getElementById("modalTitle").textContent="Rate "+title;document.getElementById("status").value=s.libraryStatus||"Not in My Library";document.getElementById("watched").value=String(!!s.watched);document.getElementById("rating").value=shownRating(s);document.getElementById("seasons").value=s.seasonsWatched||"";document.querySelectorAll('input[name="watchedOn"]').forEach(c=>c.checked=(s.watchedOn||[]).includes(c.value));document.getElementById("rateBg").style.display="flex"}
function toast(msg){let t=document.getElementById("toast");t.textContent=msg;t.style.display="block";setTimeout(()=>t.style.display="none",2200)}
document.getElementById("rateForm").onsubmit=e=>{e.preventDefault();let old=getShow(currentTitle);saveChange(currentTitle,{libraryStatus:document.getElementById("status").value,status:document.getElementById("status").value,watched:document.getElementById("watched").value==="true",rating:document.getElementById("rating").value,seasonsWatched:document.getElementById("seasons").value,watchedOn:[...document.querySelectorAll('input[name="watchedOn"]:checked')].map(c=>c.value)});document.getElementById("rateBg").style.display="none";if(currentView==="detail")renderDetail()};
document.getElementById("cancelRate").onclick=()=>document.getElementById("rateBg").style.display="none";
document.getElementById("nav").onclick=e=>{let b=e.target.closest("button[data-view]");if(!b)return;currentView=b.dataset.view;document.querySelectorAll(".nav button").forEach(x=>x.classList.toggle("active",x===b));render();window.scrollTo(0,0)};
document.getElementById("browseBtn").onclick=()=>{currentView="library";document.querySelectorAll(".nav button").forEach(x=>x.classList.toggle("active",x.dataset.view==="library"));render();window.scrollTo(0,0)};
document.getElementById("exportBtn").onclick=()=>{let backup={project:DATA.project,changes,roundHistory:DATA.roundHistory,subscriptions:JSON.parse(localStorage.getItem(SUBS_KEY)||"{}")};let blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});let a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="SwordsTV-backup.json";a.click();URL.revokeObjectURL(a.href)};
document.getElementById("importBtn").onclick=()=>document.getElementById("importFile").click();
document.getElementById("importFile").onchange=async e=>{let f=e.target.files[0];if(!f)return;try{let d=JSON.parse(await f.text());if(d.changes){changes={...changes,...d.changes};localStorage.setItem(STORAGE,JSON.stringify(changes));if(d.subscriptions)localStorage.setItem(SUBS_KEY,JSON.stringify(d.subscriptions));toast("Backup imported");render()}else toast("That file is not a SwordsTV backup")}catch{toast("Could not read backup file")}};
function showLoadError(){document.getElementById("main").innerHTML='<div class="empty">SwordsTV couldn\'t load its show data. Check your connection and reload the page.</div>'}
function loadJSON(url){return fetch(url,{cache:"no-cache"}).then(r=>{if(!r.ok)throw new Error(url+" "+r.status);return r.json()})}
Promise.all([loadJSON("data.json"),loadJSON("shows.json").catch(()=>({})),loadJSON("tmdb.json").catch(()=>({})),loadJSON("scores.json").catch(()=>({}))]).then(([d,r,t,sc])=>{DATA=d;RESEARCH=r;TMDB=t.shows||{};SCORES=sc.shows||{};SCORES_CHECKED=sc.checked||"";render()}).catch(showLoadError);
if("serviceWorker" in navigator && location.protocol.startsWith("http")){window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));}
