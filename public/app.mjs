import { CONFIG } from './config.mjs';
import DATA from './answers.mjs';
import { TIERS, BANDS, ROUNDS, MAX_SCORE, METRES_PER_POINT, FLOOR_DEPTH, bandFor, shareText } from './rules.mjs';
import { matchGuess, judgeFinal, normalize, TIER_ORDER, TIER_ID } from './matcher.mjs';
import { Ocean } from './ocean.mjs';
import { Sound } from './sound.mjs';
import { DROP_MS, easeInOut, easeOut, iconFor, tierImage, diveChart } from './presentation.mjs';

const $=id=>document.getElementById(id);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const local=['localhost','127.0.0.1'].includes(location.hostname);
const testMode=local&&new URLSearchParams(location.search).has('test');
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{/* Private browsing can limit storage. */}};
const remove=key=>{try{localStorage.removeItem(key)}catch{/* ignore */}};
const SAVE_KEY='kh:progress',DRAFT_KEY='kh:draft:',SETTINGS_KEY='kh:settings';
const PROMPTS=[...DATA.questions.map(q=>q.prompt),DATA.final.prompt];
const settings={lowPower:false,colorblind:false,shareLink:true,buddy:'krill',...read(SETTINGS_KEY,{})};
const scene=new Ocean($('ocean'),$('mascot')),sound=new Sound();
let game=null,phase='intro',busy=false,currentScore=0,visualScore=0,scoreAnimation=null,promptExitTimer=null;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,testMode?Math.min(ms,40):ms));
const isFinal=round=>round===ROUNDS-1;
const depthAfter=()=>game?.yes?FLOOR_DEPTH:currentScore*METRES_PER_POINT;

function setPhase(value){const card=$('prompt-card'),exiting=value==='plunge'&&!card.hidden;clearTimeout(promptExitTimer);card.classList.toggle('leaving',exiting);if(exiting)promptExitTimer=setTimeout(()=>{if(phase==='plunge')card.hidden=true;},testMode?40:650);phase=value;document.body.dataset.phase=value;scene.setPhase(value);$('hero').hidden=false;$('intro').hidden=value!=='intro';card.hidden=!exiting&&value!=='answering';$('answer-dock').hidden=value!=='answering';$('landing').hidden=value!=='landed';$('next-wrap').hidden=value!=='landed';$('results').hidden=value!=='done';$('falling-answer').hidden=value!=='plunge';$('tier-ladder').hidden=value!=='plunge';}
function applySettings(){scene.lowPower=settings.lowPower;document.body.classList.toggle('low-power',settings.lowPower);document.body.classList.toggle('colorblind',settings.colorblind);document.querySelectorAll('[data-setting]').forEach(input=>input.checked=!!settings[input.dataset.setting]);sound.mute(!!settings.muted);$('mute-btn').setAttribute('aria-pressed',String(!!settings.muted));$('mute-btn').setAttribute('aria-label',settings.muted?'Turn sound on':'Turn sound off');$('mute-btn').innerHTML=`<svg viewBox="0 0 20 16" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true"><path d="M2 6h3l4-4v12l-4-4H2z"/>${settings.muted?'<path d="m12 5 5 6m0-6-5 6" stroke="currentColor" stroke-width="2"/>':'<path d="M11 6h2v4h-2zm4-3h2v10h-2z"/>'}</svg>`;$('mascot').dataset.buddy=settings.buddy;const buddy=buddyOptions.find(b=>b.id===settings.buddy)||buddyOptions[0];$('mascot').querySelector('img').src=buddy.src;$('mascot').querySelector('img').alt=buddy.name;syncBuddyGold();}
const buddyOptions=[{id:'krill',name:'The Krill',src:'assets/krill.svg'},{id:'schooler',name:'Schooler',src:'assets/schooler.svg'},{id:'rare',name:'Rare Squid',src:'assets/rare.svg'},{id:'deepcut',name:'Deep Cut Angler',src:'assets/deepcut.svg'},{id:'evil',name:'Evil Krill',src:'assets/evil.svg'}];
applySettings();

// ---------------------------------------------------------------- saved progress
function save(){if(game)write(SAVE_KEY,game);}
function clearProgress(){remove(SAVE_KEY);for(let i=0;i<ROUNDS;i++)remove(DRAFT_KEY+i);}
function validSave(value){return value&&Array.isArray(value.results)&&Number.isInteger(value.round)&&value.round>=0&&value.round<ROUNDS&&value.results.length<=ROUNDS&&value.results.every(r=>r&&typeof r.score==='number');}
function setGame(value){game=value;currentScore=game.results.reduce((s,r)=>s+r.score,0);visualScore=currentScore;save();updateHud();}

function updateHud(){const results=game?.results||[];currentScore=results.reduce((s,r)=>s+r.score,0);$('score').textContent=Math.round(visualScore);$('depth').textContent=Math.round(scene.depth).toLocaleString('en-US')+'m';$('round-label').textContent=game?(game.completed?'DIVE COMPLETE':`PROMPT ${Math.min(ROUNDS,game.round+1)} OF ${ROUNDS}`):'SURFACE';document.querySelectorAll('#round-dots i').forEach((dot,i)=>{const r=results[i];dot.className=r?'done':i===(game?.round??-1)?'active':'';dot.style.setProperty('--dot-color',r?'#ffd166':'#26364b')});}
async function begin(){if(busy)return;busy=true;$('start-btn').disabled=true;await sound.init();try{clearProgress();setGame({version:1,round:0,results:[],completed:false,yes:false});sound.event('begin');scene.targetActive=1;showRound();}finally{busy=false;$('start-btn').disabled=false;}}
function showRound(){setPhase('answering');syncBuddyGold();$('answer-status').textContent='';$('answer-status').className='answer-status';const final=isFinal(game.round);$('prompt-number').textContent=`PROMPT ${game.round+1} OF ${ROUNDS}${final?' · THE LAST ONE':''}`;$('prompt-text').textContent=PROMPTS[game.round];$('answer').value=read(DRAFT_KEY+game.round,'');$('answer').disabled=false;$('submit-btn').disabled=!$('answer').value.trim();const depth=depthAfter();scene.setDepth(depth);scene.roundBase=depth;scene.roundIndex=game.round;scene.round(depth);updateHud();$('answer').focus({preventScroll:true});}

// Scoring happens entirely in the browser. Every non-empty answer ends the round.
async function submit(){if(!game||busy||phase!=='answering'||game.completed||game.results.length>game.round)return;const raw=$('answer').value.trim();if(!raw)return;busy=true;$('submit-btn').disabled=true;try{
  const round=game.round,scored=isFinal(round)?judgeFinal(DATA.final,raw):matchGuess(DATA.questions[round],raw);if(!scored)return;
  const oldScore=currentScore,oldDepth=depthAfter();
  game.results.push({...scored,round,promptText:PROMPTS[round]});
  if(isFinal(round)){game.completed=true;game.yes=scored.kind==='yes';}
  currentScore=game.results.reduce((s,r)=>s+r.score,0);
  const result={...game.results.at(-1),depthAfter:depthAfter()};game.results[game.results.length-1]=result;
  save();remove(DRAFT_KEY+round);
  sound.event('submit');{const rect=$('answer').getBoundingClientRect();for(let i=0;i<12;i++)scene.typeAt(rect.left+Math.random()*rect.width,rect.top+Math.random()*rect.height,1);}
  await plunge(result,oldScore,oldDepth);
}finally{busy=false;if(phase==='answering'){$('submit-btn').disabled=!$('answer').value.trim();$('answer').focus({preventScroll:true});}}}
function animateScore(from,to,gold=false,fromDepth=from*METRES_PER_POINT,toDepth=to*METRES_PER_POINT){
  if(scoreAnimation)cancelAnimationFrame(scoreAnimation);
  const started=performance.now(),duration=testMode?60:gold?(toDepth-fromDepth>1200?2600:1100):700;
  const frame=t=>{const p=Math.min(1,(t-started)/duration),e=1-(1-p)**4;visualScore=from+(to-from)*e;scene.depth=fromDepth+(toDepth-fromDepth)*e;$('score').textContent=Math.round(visualScore);if(p<1)scoreAnimation=requestAnimationFrame(frame);else{visualScore=to;scene.depth=toDepth;if(gold){$('score').classList.add('slam');setTimeout(()=>$('score').classList.remove('slam'),520);}}};
  scoreAnimation=requestAnimationFrame(frame);
}
async function plunge(result,oldScore,oldDepth){
  setPhase('plunge');document.body.dataset.tier=result.tier||'miss';visualScore=oldScore;updateHud();scene.roundIndex=game.round;
  const fall=$('falling-answer'),ladder=$('tier-ladder');fall.textContent=result.answer?`“${result.answer.toUpperCase()}”`:'';fall.style.color=TIERS[result.tier]?.color||'#7d93b8';fall.style.setProperty('--chip-color',TIERS[result.tier]?.color||'#7d93b8');
  ladder.innerHTML=result.tier?Object.entries(TIERS).map(([id,t])=>`<div class="tier-line" data-tier="${id}" data-score="${t.score}" style="--line-color:${t.color}"><span>${tierImage(id)}${t.name.toUpperCase()} · ${t.score}</span></div>`).join(''):'';
  const travel=result.depthAfter-oldDepth,duration=testMode?80:DROP_MS[result.kind==='yes'?'yes':result.tier||'miss'],began=performance.now();let lastPassed=-1;
  if(result.tier)sound.event('sink');else{sound.event('miss');$('game').classList.add('shake');setTimeout(()=>$('game').classList.remove('shake'),500);}
  await new Promise(resolve=>{const frame=t=>{const p=Math.min(1,(t-began)/duration),e=easeInOut(p);scene.drop(oldDepth,result,p);const sway=result.tier==='plankton'?36*Math.sin(p*7)*(1-.25*p):Math.sin(p*(result.tier==='krillion'?24:16))*(1-p)*(result.tier==='krillion'?26:14);fall.style.left=`calc(50% - 24px + ${sway}px)`;fall.style.rotate=(sway*(result.tier==='plankton'?.55:.4))+'deg';fall.style.top=(scene.layout().height/2-60)+'px';
    const travelled=90+(travel-90)*e;Array.from(ladder.children).forEach((line,i)=>{if(travelled>=Number(line.dataset.score)*METRES_PER_POINT-4&&!line.classList.contains('active')){line.classList.add('active');if(i>lastPassed){sound.event('tier');lastPassed=i;}}});
    if(p<1)requestAnimationFrame(frame);else{scene.cameraDepth=scene.cameraTarget;resolve();}};requestAnimationFrame(frame);});
  showLanding(result,oldScore,oldDepth);
}
function landingCopy(result){
  const tier=TIERS[result.tier];
  if(result.kind==='yes')return{eyebrow:tier.name.toUpperCase(),answer:`“${result.answer}”`,points:`<b>+${result.score} PTS</b> · straight to the trench floor`,quip:'the designated gem. the very bottom.'};
  if(result.kind==='no')return{eyebrow:'MESSAGE RECEIVED',answer:`“${result.answer}”`,points:'<b>+0 PTS</b>',quip:''};
  if(result.kind==='not_accepted')return{eyebrow:'NOT ACCEPTED',answer:`“${result.answer}”`,points:'<b>+0 PTS</b>',quip:result.message};
  if(!tier)return{eyebrow:'NOTHING LANDED',answer:`“${result.rawAnswer}”`,points:'<b>+0 PTS</b>',quip:'not on our chart. never made it onto the reef.'};
  return{eyebrow:tier.name.toUpperCase(),answer:`“${result.answer}”`,points:`<b>+${result.score} PTS</b> · sink ${(result.score*METRES_PER_POINT).toLocaleString('en-US')}m`,quip:result.message||tier.blurb};
}
// Shown when the matched answer differs from what was typed (typo or partial match).
function typedNote(result){if(!result.rawAnswer||!result.answer||['yes','no','unlisted'].includes(result.kind))return'';const a=normalize(result.rawAnswer),b=normalize(String(result.answer).replace(/\([^)]*\)/g,' '));return a===b||a.replace(/ /g,'')===b.replace(/ /g,'')?'':`you typed “${result.rawAnswer}”`;}
function showLanding(result,oldScore=currentScore-result.score,oldDepth){
  setPhase('landed');const tier=TIERS[result.tier];document.body.dataset.tier=result.tier||'miss';document.documentElement.style.setProperty('--tier',tier?.color||'#7d93b8');
  const icon=$('land-icon');icon.hidden=!tier;icon.src='assets/'+(iconFor(result.tier)||'plankton')+'.svg';icon.style.visibility=result.tier==='krillion'?'hidden':'visible';
  const copy=landingCopy(result);$('land-tier').textContent=copy.eyebrow;$('land-answer').textContent=copy.answer;$('land-points').innerHTML=copy.points;$('land-quip').textContent=copy.quip||'';$('land-typed').textContent=typedNote(result);
  $('next-btn').textContent=game.completed?(game.yes?'CONTINUE ♥':'SURFACE ▲'):'DESCEND ▼';
  const endDepth=result.depthAfter??depthAfter(),startDepth=oldDepth??Math.max(0,endDepth-result.score*METRES_PER_POINT);
  if(tier)sound.event(result.tier);scene.target=endDepth;scene.roundIndex=game.round;
  if(!scene.fx)scene.fx={tier:result.tier,progress:1};
  scene.moveCamera(endDepth+30,testMode?1:500);
  const gold=result.tier==='krillion';visualScore=oldScore;
  if(gold){$('mascot').classList.remove('celebrate');void $('mascot').offsetWidth;$('mascot').classList.add('celebrate');setTimeout(()=>$('mascot').classList.remove('celebrate'),testMode?30:1250);scene.goldLandAt=performance.now();setTimeout(()=>{if(phase!=='landed'||game.results.at(-1)?.round!==result.round)return;syncBuddyGold();scene.burst('#ffd166',result.kind==='yes'?80:42);animateScore(oldScore,currentScore,true,startDepth,endDepth);},testMode?20:1000);}else animateScore(oldScore,currentScore,false,startDepth,endDepth);
  if(result.tier==='rare'){$('game').classList.add('shake');setTimeout(()=>$('game').classList.remove('shake'),500);}
  if(result.score>=60){scene.burst(tier.color,result.score===100?36:22);document.querySelector('.flash').style.background=tier.color;document.querySelector('.flash').classList.remove('on');void document.querySelector('.flash').offsetWidth;document.querySelector('.flash').classList.add('on');}
  if(!gold)syncBuddyGold();updateHud();
}
async function next(){if(busy||!game)return;busy=true;try{if(game.completed){if(game.yes){scene.moveCamera(FLOOR_DEPTH+30,testMode?1:900);}else{sound.event('surface');const duration=Math.min(9000,Math.max(2500,(currentScore*METRES_PER_POINT+30)*3));scene.moveCamera(-45,testMode?1:duration,easeOut);}await showResults();return;}sound.event('begin');game.round++;save();showRound();}finally{busy=false;}}
function syncBuddyGold(){const gold=game?.results.some(r=>r.tier==='krillion');$('mascot').classList.toggle('gold',!!gold);if(settings.buddy==='krill')$('mascot').querySelector('img').src=gold?'assets/krill-gold.svg':'assets/krill.svg';}

// ------------------------------------------------------------------ results
const HEART='<svg class="pixel-heart" viewBox="0 0 13 11" shape-rendering="crispEdges" aria-hidden="true"><path fill="#ff5d8f" d="M1 1h4v1h1v1h1V2h1V1h4v1h1v4h-1v1h-1v1H9v1H8v1H5V9H4V8H3V7H2V6H1V5H0V2h1z"/><path fill="#ffd1df" d="M2 2h2v1H3v1H2z"/></svg>';
function answerList(round){const q=DATA.questions[round];return TIER_ORDER.flatMap(key=>(q.tiers[key]||[]).map(([answer])=>({answer,tier:TIER_ID[key],score:TIERS[TIER_ID[key]].score}))).sort((a,b)=>b.score-a.score||a.answer.localeCompare(b.answer));}
function catchRow(r,i){const dot=`style="--dot-color:${TIERS[r.tier]?.color||'#43556b'}"`,body=`<span class="review-number">${i+1}</span><i class="review-dot">${tierImage(r.tier)}</i><span class="review-question">${escape(PROMPTS[i])}<small>${escape(r.answer||r.rawAnswer||'—')}</small></span><span class="review-points">${r.score}</span>`;return isFinal(i)?`<li><div class="review-toggle final-row" ${dot}>${body}<span class="review-sign">${r.kind==='yes'?'♥':''}</span></div></li>`:`<li><button class="review-toggle" aria-expanded="false" data-review="${i}" ${dot}>${body}<span class="review-sign">+</span></button><div class="review-expanded" hidden></div></li>`;}
async function showResults(){
  setPhase('done');visualScore=currentScore;syncBuddyGold();const yes=!!game.yes,metres=yes?FLOOR_DEPTH:currentScore*METRES_PER_POINT;
  scene.setDepth(yes?FLOOR_DEPTH:0);if(yes&&scene.cameraDepth<FLOOR_DEPTH-200)scene.moveCamera(FLOOR_DEPTH+30,1);
  document.body.dataset.ending=yes?'yes':'normal';const band=bandFor(currentScore);document.documentElement.style.setProperty('--tier',TIERS[yes?'krillion':band.tier].color);
  const ending=yes?`<section class="ending ending-yes">${HEART}<p class="ending-kicker">ONE IN A KRILLIOHN</p><p class="ending-message">${escape(CONFIG.yesMessage)}</p><p class="ending-sign">— ${escape(CONFIG.myName)}</p></section>`:`<section class="ending ending-normal"><p class="ending-message">${escape(CONFIG.neutralMessage)}</p><p class="ending-sign">— ${escape(CONFIG.myName)}</p></section>`;
  $('results').innerHTML=`<header class="result-header"><span class="result-brand">KRILLIOHN</span><span>${yes?'the trench floor':'dive complete'}</span></header>${ending}<div class="result-score"><strong>${currentScore}</strong><span>-${metres.toLocaleString('en-US')}m${yes?' · the very bottom':''}</span></div><p class="rule">DIVE LOG · DEEPER = RARER</p>${diveChart(game.results,escape)}<p class="rule">THE BEARING · OUT OF ${MAX_SCORE}</p><ul class="band-list">${BANDS.map(b=>`<li class="${b===band?'current':''}">${tierImage(b.tier)}<span class="band-range" style="color:${TIERS[b.tier].color}">${b.min}–${b.max}</span><span>${b.name}. ${b.text}</span></li>`).join('')}</ul><div class="share-actions"><button class="quiet" id="copy-result">Copy result</button>${navigator.share?'<button class="quiet" id="native-share">Share…</button>':''}</div><p class="rule">THE CATCH · TAP A ROUND FOR EVERY ANSWER</p><ul class="answer-review">${game.results.map(catchRow).join('')}</ul><footer class="original-footer result-footer"><p>one in a krilliohn.</p><p class="independent">Krilliohn is a personal edition built on <a href="LICENSE.txt" target="_blank" rel="noopener">OpenKrillion</a> (MIT License). Font: <a href="assets/VT323-LICENSE.txt" target="_blank" rel="noopener">VT323</a> (SIL OFL).</p></footer>`;
  $('results').scrollTop=0;updateHud();
}
function resultText(){return shareText(game.results,{depth:game.yes?FLOOR_DEPTH:undefined,link:settings.shareLink?CONFIG.siteUrl:''});}
async function copyResult(button){try{await navigator.clipboard.writeText(resultText());button.textContent='Copied ✓';setTimeout(()=>button.textContent='Copy result',2200);}catch{button.textContent='Select and copy below';const box=document.createElement('textarea');box.value=resultText();box.readOnly=true;box.style.width='100%';button.parentElement.after(box);box.select();}}
function expandReview(button){const i=Number(button.dataset.review),box=button.nextElementSibling,open=button.getAttribute('aria-expanded')==='true';button.setAttribute('aria-expanded',String(!open));button.querySelector('.review-sign').textContent=open?'+':'−';box.hidden=open;if(open||box.dataset.filled)return;box.dataset.filled='1';const answers=answerList(i),own=game.results[i]?.answer;box.innerHTML=`${answers.length>30?'<input class="search-answers" aria-label="Search accepted answers" placeholder="search '+answers.length+' answers…">':''}<ul class="review-list">${answers.map(a=>`<li data-answer="${escape(a.answer.toLowerCase())}" style="color:${TIERS[a.tier].color}"><span>${escape(a.answer)}${a.answer===own?'<b class="you">YOU</b>':''}</span><span>+${a.score}</span></li>`).join('')}</ul>`;}
function openWardrobe(){$('buddy-list').innerHTML=buddyOptions.map(b=>`<button data-buddy="${b.id}" aria-pressed="${settings.buddy===b.id}"><img src="${b.src}" alt=""><span>${b.name}</span><small>${settings.buddy===b.id?'Diving':'Ready'}</small></button>`).join('');openDialog('wardrobe-dialog');}
function openDialog(id){document.querySelectorAll('dialog[open]').forEach(d=>d.close());$(id).showModal();}
function doAction(action){document.querySelectorAll('dialog[open]').forEach(d=>d.close());if(action==='settings')openDialog('settings-dialog');if(action==='wardrobe')openWardrobe();}
function tick(){if(game)$('depth').textContent=Math.round(scene.depth).toLocaleString('en-US')+'m';}

$('start-btn').addEventListener('click',begin);$('menu-btn').addEventListener('click',()=>openDialog('menu-dialog'));$('settings-btn').addEventListener('click',()=>openDialog('settings-dialog'));$('wardrobe-btn').addEventListener('click',openWardrobe);$('next-btn').addEventListener('click',next);
$('mute-btn').addEventListener('click',async()=>{await sound.init();settings.muted=!settings.muted;write(SETTINGS_KEY,settings);applySettings();});$('mascot').addEventListener('click',async()=>{await sound.init();sound.event('blub');$('mascot').classList.remove('poked');void $('mascot').offsetWidth;$('mascot').classList.add('poked');setTimeout(()=>$('mascot').classList.remove('poked'),1000)});
$('answer-form').addEventListener('submit',e=>{e.preventDefault();void submit()});$('answer').addEventListener('input',()=>{const r=$('answer').getBoundingClientRect();scene.typeAt(r.left+14+Math.min(11*$('answer').value.length,r.width-28),r.top+5);if(game)write(DRAFT_KEY+game.round,$('answer').value);$('submit-btn').disabled=busy||!$('answer').value.trim();});
document.addEventListener('click',e=>{const close=e.target.closest('[data-close]');if(close)close.closest('dialog').close();const action=e.target.closest('[data-action]');if(action)doAction(action.dataset.action);const r=e.target.closest('[data-review]');if(r)expandReview(r);const copy=e.target.closest('#copy-result');if(copy)void copyResult(copy);if(e.target.closest('#native-share'))navigator.share?.({text:resultText()}).catch(()=>{});const buddy=e.target.closest('[data-buddy]');if(buddy){settings.buddy=buddy.dataset.buddy;write(SETTINGS_KEY,settings);applySettings();openWardrobe()}});
document.addEventListener('change',e=>{if(e.target.matches('[data-setting]')){settings[e.target.dataset.setting]=e.target.checked;write(SETTINGS_KEY,settings);applySettings()}});
document.addEventListener('input',e=>{if(e.target.matches('.search-answers')){const text=e.target.value.toLowerCase();e.target.nextElementSibling.querySelectorAll('li').forEach(li=>li.hidden=!li.dataset.answer.includes(text));}});
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close()}}));
document.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='f'&&!['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)&&!e.ctrlKey&&!e.metaKey){if(document.fullscreenElement)document.exitFullscreen?.();else $('game').requestFullscreen?.().catch(()=>{})}});
// Browsers only allow audio after a gesture; a resumed game unlocks it on the first tap.
for(const type of ['pointerdown','keydown'])document.addEventListener(type,()=>void sound.init(),{once:true});
function viewport(){const height=window.visualViewport?.height||innerHeight;document.documentElement.style.setProperty('--vh',height+'px')}viewport();window.visualViewport?.addEventListener('resize',viewport);window.addEventListener('resize',viewport);
window.render_game_to_text=()=>JSON.stringify({phase,prompt:game?PROMPTS[game.round]:null,round:game?.round??0,totalRounds:ROUNDS,score:Math.round(visualScore),targetScore:currentScore,depth:Math.round(scene.depth),targetDepth:scene.target,cameraDepth:Math.round(scene.cameraDepth),ending:game?.completed?(game.yes?'yes':'normal'):null,results:game?.results.map(r=>({raw:r.rawAnswer,answer:r.answer,tier:r.tier,score:r.score,kind:r.kind}))||[],draft:$('answer').value,sound:{supported:!!(window.AudioContext||window.webkitAudioContext),state:sound.ac?.state||'not-started',muted:sound.muted},coordinates:'origin at top-left, x rightward, y downward; depth in metres',lowPower:settings.lowPower});
window.advanceTime=async ms=>{if(!local)return;scene.time+=ms/1000;scene.depth=scene.target;scene.active=scene.targetActive;scene.cameraDepth=scene.cameraTarget;scene.cameraJob=null;scene.draw();tick();await new Promise(r=>setTimeout(r,0));};
setInterval(tick,80);

// Boot: ?reset clears saved progress; otherwise a saved dive resumes where it left off.
(()=>{const params=new URLSearchParams(location.search);if(params.has('reset')){clearProgress();params.delete('reset');const query=params.toString();history.replaceState(null,'',location.pathname+(query?'?'+query:'')+location.hash);}
  const saved=read(SAVE_KEY,null);if(!validSave(saved)){if(saved)clearProgress();return;}
  setGame(saved);scene.targetActive=1;
  if(game.completed){if(game.yes){scene.cameraDepth=scene.cameraTarget=FLOOR_DEPTH+30;scene.cameraJob=null;}void showResults();}
  else if(game.results.length>game.round){const last=game.results.at(-1);showLanding(last,currentScore-last.score,(currentScore-last.score)*METRES_PER_POINT);}
  else showRound();})();
