import { CONFIG } from './config.mjs';
import DATA from './answers.mjs';
import { TIERS, LADDER, BANDS, ROUNDS, MAX_SCORE, METRES_PER_POINT, FLOOR_DEPTH, ROUND_MS, PREVIEW_MS, bandFor, shareText } from './rules.mjs';
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
const SETTINGS_KEY='kh:settings';
const PROMPTS=[...DATA.questions.map(q=>q.prompt),DATA.final.prompt];
const settings={lowPower:false,colorblind:false,corrections:true,clearRejected:false,shareLink:true,buddy:'krill',...read(SETTINGS_KEY,{})};
const scene=new Ocean($('ocean'),$('mascot')),sound=new Sound();
let game=null,phase='intro',busy=false,currentScore=0,visualScore=0,scoreAnimation=null,promptExitTimer=null,correction=null,paused=false,autoSent=false,lastTick=-1,clockOffset=0,noCount=0;
const now=()=>Date.now()+clockOffset; // clockOffset only moves in local tests (advanceTime)
const isFinal=round=>round===ROUNDS-1;
const depthAfter=()=>game?.yes?FLOOR_DEPTH:currentScore*METRES_PER_POINT;

function setPhase(value){const card=$('prompt-card'),exiting=value==='plunge'&&!card.hidden;clearTimeout(promptExitTimer);card.classList.toggle('leaving',exiting);if(exiting)promptExitTimer=setTimeout(()=>{if(phase==='plunge')card.hidden=true;},testMode?40:650);phase=value;if(value!=='answering')document.body.classList.remove('timer-hot');document.body.dataset.phase=value;scene.setPhase(value);$('hero').hidden=false;$('intro').hidden=value!=='intro';card.hidden=!exiting&&!['preview','answering'].includes(value);$('answer-dock').hidden=value!=='answering';$('preview-label').hidden=value!=='preview';$('landing').hidden=value!=='landed';$('next-wrap').hidden=value!=='landed';$('results').hidden=value!=='done';$('falling-answer').hidden=value!=='plunge';$('tier-ladder').hidden=value!=='plunge';}
function applySettings(){scene.lowPower=settings.lowPower;document.body.classList.toggle('low-power',settings.lowPower);document.body.classList.toggle('colorblind',settings.colorblind);document.querySelectorAll('[data-setting]').forEach(input=>input.checked=!!settings[input.dataset.setting]);sound.mute(!!settings.muted);$('mute-btn').setAttribute('aria-pressed',String(!!settings.muted));$('mute-btn').setAttribute('aria-label',settings.muted?'Turn sound on':'Turn sound off');$('mute-btn').innerHTML=`<svg viewBox="0 0 20 16" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true"><path d="M2 6h3l4-4v12l-4-4H2z"/>${settings.muted?'<path d="m12 5 5 6m0-6-5 6" stroke="currentColor" stroke-width="2"/>':'<path d="M11 6h2v4h-2zm4-3h2v10h-2z"/>'}</svg>`;$('mascot').dataset.buddy=settings.buddy;const buddy=buddyOptions.find(b=>b.id===settings.buddy)||buddyOptions[0];$('mascot').querySelector('img').src=buddy.src;$('mascot').querySelector('img').alt=buddy.name;syncBuddyGold();}
const buddyOptions=[{id:'krill',name:'The Krill',src:'assets/krill.svg'},{id:'schooler',name:'Schooler',src:'assets/schooler.svg'},{id:'rare',name:'Rare Squid',src:'assets/rare.svg'},{id:'deepcut',name:'Deep Cut Angler',src:'assets/deepcut.svg'},{id:'evil',name:'Evil Krill',src:'assets/evil.svg'}];
applySettings();

// A dive lives only in memory: reloading the page (or "Back to the dive") starts over.
// Clean up anything an earlier version saved in this browser.
for(const key of ['kh:progress',...Array.from({length:ROUNDS},(_,i)=>'kh:draft:'+i)])remove(key);
function setGame(value){game=value;currentScore=game.results.reduce((s,r)=>s+r.score,0);visualScore=currentScore;updateHud();}

function updateHud(){const results=game?.results||[];currentScore=results.reduce((s,r)=>s+r.score,0);$('score').textContent=Math.round(visualScore);$('depth').textContent=Math.round(scene.depth).toLocaleString('en-US')+'m';$('round-label').textContent=game?(game.completed?'DIVE COMPLETE':`PROMPT ${Math.min(ROUNDS,game.round+1)} OF ${ROUNDS}`):'SURFACE';document.querySelectorAll('#round-dots i').forEach((dot,i)=>{const r=results[i];dot.className=r?'done':i===(game?.round??-1)?'active':'';dot.style.setProperty('--dot-color',r?'#ffd166':'#26364b')});}
async function begin(){if(busy)return;busy=true;$('start-btn').disabled=true;await sound.init();try{paused=false;setGame({version:2,round:0,roundStart:now()+PREVIEW_MS,pausedAt:null,results:[],completed:false,yes:false});sound.event('begin');scene.targetActive=1;showRound();}finally{busy=false;$('start-btn').disabled=false;}}
// As in the original: a 3-second "clock starts in" descent, then the answer clock (tick() drives both).
function showRound(){setPhase('preview');syncBuddyGold();correction=null;autoSent=false;lastTick=-1;noCount=0;$('answer-status').textContent='';$('answer-status').className='answer-status';const final=isFinal(game.round);$('prompt-number').textContent=`PROMPT ${game.round+1} OF ${ROUNDS}${final?' · THE LAST ONE':''}`;$('prompt-text').textContent=PROMPTS[game.round];$('answer').value='';$('answer').disabled=true;$('submit-btn').disabled=true;const depth=depthAfter();scene.setDepth(depth);scene.roundBase=depth;scene.roundIndex=game.round;scene.round(depth);updateHud();tick();}

function reject(message,{clear=false}={}){correction=null;$('answer-status').className='answer-status';$('answer-status').textContent=message;sound.event('reject');$('answer').classList.remove('shake');void $('answer').offsetWidth;$('answer').classList.add('shake');if(clear||settings.clearRejected)$('answer').value='';}
// Like the original game: a guess that only matches after correction (alias, typo,
// part of an answer) is first filled into the box; pressing return again scores it.
// Differences in case, accents, punctuation or spacing don't need confirming.
function sameAnswer(raw,answer){const a=normalize(raw);return[answer,String(answer).replace(/\([^)]*\)/g,' ')].some(text=>{const b=normalize(text);return a===b||a.replace(/ /g,'')===b.replace(/ /g,'');});}
function propose(raw,result){correction={text:result.answer,result};$('answer').value=result.answer;$('answer-status').className='answer-status correction';$('answer-status').innerHTML=`“${escape(raw)}” → <b>“${escape(result.answer)}”</b><small>submit again to confirm · or edit</small>`;$('answer').focus({preventScroll:true});}
const noReply=raw=>{const list=CONFIG.noReplies?.length?CONFIG.noReplies:['nice try. try again'];return list[noCount++%list.length].replaceAll('{answer}',raw);};

// Scoring happens entirely in the browser. A wrong or unlisted answer gets another
// try; when the clock runs out, whatever is typed is scored (or scores 0).
async function submit(timeout=false){if(paused)resumeGame();if(!game||busy||!['preview','answering'].includes(phase)||paused||game.completed||game.results.length>game.round)return;const raw=$('answer').value.trim();if(!raw&&!timeout)return;if(!timeout&&now()<game.roundStart)return;busy=true;$('submit-btn').disabled=true;try{
  const round=game.round,final=isFinal(round),checked=raw?(final?judgeFinal(DATA.final,raw):matchGuess(DATA.questions[round],raw)):null;
  let scored;
  if(!final&&!timeout&&correction&&raw===correction.text)scored={...correction.result,confirmed:true}; // second Enter confirms
  else if(checked?.kind==='match'&&!final&&!timeout&&settings.corrections&&!sameAnswer(raw,checked.answer)){propose(raw,checked);return;}
  else if(checked&&(checked.kind==='match'||checked.kind==='yes'))scored=checked;
  else if(!timeout){
    if(final&&checked.kind==='no')reject(noReply(raw),{clear:true});
    else if(checked.kind==='not_accepted')reject(`“${raw}”: ${checked.message} · try again`);
    else reject(`“${raw}”: no echo. try again`);
    return;
  }
  else if(checked?.kind==='not_accepted')scored=checked;
  else scored={rawAnswer:raw||null,answer:null,tier:null,score:0,kind:'timeout',how:null,message:null};
  const oldScore=currentScore,oldDepth=depthAfter();
  game.results.push({...scored,round,promptText:PROMPTS[round]});
  if(isFinal(round)){game.completed=true;game.yes=scored.kind==='yes';}
  currentScore=game.results.reduce((s,r)=>s+r.score,0);
  const result={...game.results.at(-1),depthAfter:depthAfter()};game.results[game.results.length-1]=result;
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
  ladder.innerHTML=result.tier?LADDER.map(([id,t])=>`<div class="tier-line" data-tier="${id}" data-score="${t.score}" style="--line-color:${t.color}"><span>${tierImage(id)}${t.name.toUpperCase()} · ${t.score}</span></div>`).join(''):'';
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
  if(result.kind==='timeout'&&isFinal(result.round))return{eyebrow:'TIME’S UP',answer:'—',points:'<b>+0 PTS</b>',quip:'the clock beat you to it.'};
  if(result.kind==='not_accepted')return{eyebrow:'NOT ACCEPTED',answer:`“${result.answer}”`,points:'<b>+0 PTS</b>',quip:result.message};
  if(!tier)return{eyebrow:'NOTHING LANDED',answer:'—',points:'<b>+0 PTS</b>',quip:result.rawAnswer?'never made it onto the reef.':'the clock beat you to it.'};
  return{eyebrow:tier.name.toUpperCase(),answer:`“${result.answer}”`,points:`<b>+${result.score} PTS</b> · sink ${(result.score*METRES_PER_POINT).toLocaleString('en-US')}m`,quip:result.message||tier.blurb};
}
// Shown when the matched answer differs from what was typed (typo or partial match).
function typedNote(result){if(!result.rawAnswer||!result.answer||result.kind==='yes'||result.confirmed)return'';const a=normalize(result.rawAnswer),b=normalize(String(result.answer).replace(/\([^)]*\)/g,' '));return a===b||a.replace(/ /g,'')===b.replace(/ /g,'')?'':`you typed “${result.rawAnswer}”`;}
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
async function next(){if(busy||!game)return;busy=true;try{if(game.completed){if(game.yes){scene.moveCamera(FLOOR_DEPTH+30,testMode?1:900);}else{sound.event('surface');const duration=Math.min(9000,Math.max(2500,(currentScore*METRES_PER_POINT+30)*3));scene.moveCamera(-45,testMode?1:duration,easeOut);}await showResults();return;}sound.event('begin');game.round++;game.roundStart=now()+PREVIEW_MS;game.pausedAt=null;paused=false;showRound();}finally{busy=false;}}
function syncBuddyGold(){const gold=game?.results.some(r=>r.tier==='krillion');$('mascot').classList.toggle('gold',!!gold);if(settings.buddy==='krill')$('mascot').querySelector('img').src=gold?'assets/krill-gold.svg':'assets/krill.svg';}

// ------------------------------------------------------------------ results
const HEART='<svg class="pixel-heart" viewBox="0 0 13 11" shape-rendering="crispEdges" aria-hidden="true"><path fill="#ff5d8f" d="M1 1h4v1h1v1h1V2h1V1h4v1h1v4h-1v1h-1v1H9v1H8v1H5V9H4V8H3V7H2V6H1V5H0V2h1z"/><path fill="#ffd1df" d="M2 2h2v1H3v1H2z"/></svg>';
function answerList(round){const q=DATA.questions[round];return TIER_ORDER.flatMap(key=>(q.tiers[key]||[]).map(([answer])=>({answer,tier:TIER_ID[key],score:TIERS[TIER_ID[key]].score}))).sort((a,b)=>b.score-a.score||a.answer.localeCompare(b.answer));}
function catchRow(r,i){const dot=`style="--dot-color:${TIERS[r.tier]?.color||'#43556b'}"`,body=`<span class="review-number">${i+1}</span><i class="review-dot">${tierImage(r.tier)}</i><span class="review-question">${escape(PROMPTS[i])}<small>${escape(r.answer||r.rawAnswer||'—')}</small></span><span class="review-points">${r.score}</span>`;return isFinal(i)?`<li><div class="review-toggle final-row" ${dot}>${body}<span class="review-sign">${r.kind==='yes'?'♥':''}</span></div></li>`:`<li><button class="review-toggle" aria-expanded="false" data-review="${i}" ${dot}>${body}<span class="review-sign">+</span></button><div class="review-expanded" hidden></div></li>`;}
// An ending message as paragraphs (blank lines) with line breaks kept. A closing
// that already ends with your name ("Yours,\nNoam") is the signature; otherwise "— Noam" is added.
function letter(text){
  const paragraphs=String(text||'').trim().split(/\n\s*\n/).map(p=>p.split('\n').map(line=>line.trim()));
  const last=paragraphs.at(-1)||[],signed=last.at(-1)?.toLowerCase()===String(CONFIG.myName).trim().toLowerCase();
  const body=signed?paragraphs.slice(0,-1):paragraphs;
  const html=body.map(lines=>`<p>${lines.map(escape).join('<br>')}</p>`).join('');
  return `<div class="ending-message">${html}</div><p class="ending-sign">${signed?last.map(escape).join('<br>'):'— '+escape(CONFIG.myName)}</p>`;
}
async function showResults(){
  setPhase('done');visualScore=currentScore;syncBuddyGold();const yes=!!game.yes,metres=yes?FLOOR_DEPTH:currentScore*METRES_PER_POINT;
  scene.setDepth(yes?FLOOR_DEPTH:0);if(yes&&scene.cameraDepth<FLOOR_DEPTH-200)scene.moveCamera(FLOOR_DEPTH+30,1);
  document.body.dataset.ending=yes?'yes':'normal';const band=bandFor(currentScore);document.documentElement.style.setProperty('--tier',TIERS[yes?'krillion':band.tier].color);
  const ending=yes?`<section class="ending ending-yes">${HEART}<p class="ending-kicker">ONE IN A KRILLIOHN</p>${letter(CONFIG.yesMessage)}</section>`:`<section class="ending ending-normal">${letter(CONFIG.neutralMessage)}</section>`;
  $('results').innerHTML=`<header class="result-header"><span class="result-brand">KRILLIOHN</span><span>${yes?'the trench floor':'dive complete'}</span></header>${ending}<div class="result-score"><strong>${currentScore}</strong><span>-${metres.toLocaleString('en-US')}m${yes?' · the very bottom':''}</span></div><p class="rule">DIVE LOG · DEEPER = RARER</p>${diveChart(game.results,escape)}<p class="rule">THE BEARING · OUT OF ${MAX_SCORE}</p><ul class="band-list">${BANDS.map(b=>`<li class="${b===band?'current':''}">${tierImage(b.tier)}<span class="band-range" style="color:${TIERS[b.tier].color}">${b.min}–${b.max}</span><span>${b.name}. ${b.text}</span></li>`).join('')}</ul><div class="share-actions"><button class="quiet" id="copy-result">Copy result</button>${navigator.share?'<button class="quiet" id="native-share">Share…</button>':''}</div><p class="rule">THE CATCH · TAP A ROUND FOR EVERY ANSWER</p><ul class="answer-review">${game.results.map(catchRow).join('')}</ul><footer class="original-footer result-footer"><p>one in a krilliohn.</p><p class="independent">Krilliohn is a personal edition built on <a href="LICENSE.txt" target="_blank" rel="noopener">OpenKrillion</a> (MIT License). Font: <a href="assets/VT323-LICENSE.txt" target="_blank" rel="noopener">VT323</a> (SIL OFL).</p></footer>`;
  $('results').scrollTop=0;updateHud();
}
function resultText(){return shareText(game.results,{depth:game.yes?FLOOR_DEPTH:undefined,link:settings.shareLink?CONFIG.siteUrl:''});}
async function copyResult(button){try{await navigator.clipboard.writeText(resultText());button.textContent='Copied ✓';setTimeout(()=>button.textContent='Copy result',2200);}catch{button.textContent='Select and copy below';const box=document.createElement('textarea');box.value=resultText();box.readOnly=true;box.style.width='100%';button.parentElement.after(box);box.select();}}
function expandReview(button){const i=Number(button.dataset.review),box=button.nextElementSibling,open=button.getAttribute('aria-expanded')==='true';button.setAttribute('aria-expanded',String(!open));button.querySelector('.review-sign').textContent=open?'+':'−';box.hidden=open;if(open||box.dataset.filled)return;box.dataset.filled='1';const answers=answerList(i),own=game.results[i]?.answer;box.innerHTML=`${answers.length>30?'<input class="search-answers" aria-label="Search accepted answers" placeholder="search '+answers.length+' answers…">':''}<ul class="review-list">${answers.map(a=>`<li data-answer="${escape(a.answer.toLowerCase())}" style="color:${TIERS[a.tier].color}"><span>${escape(a.answer)}${a.answer===own?'<b class="you">YOU</b>':''}</span><span>+${a.score}</span></li>`).join('')}</ul>`;}
function openWardrobe(){$('buddy-list').innerHTML=buddyOptions.map(b=>`<button data-buddy="${b.id}" aria-pressed="${settings.buddy===b.id}"><img src="${b.src}" alt=""><span>${b.name}</span><small>${settings.buddy===b.id?'Diving':'Ready'}</small></button>`).join('');openDialog('wardrobe-dialog');}
// The clock stops while a menu is open (as in the original) and while the page is
// hidden, so switching apps doesn't eat her time.
function pauseGame(){if(!game||!['preview','answering'].includes(phase)||paused||game.completed||now()>game.roundStart+ROUND_MS)return;paused=true;game.pausedAt=now();}
function resumeGame(){if(!paused||document.hidden||document.querySelector('dialog[open]'))return;if(game.pausedAt)game.roundStart+=now()-game.pausedAt;game.pausedAt=null;paused=false;tick();}
function openDialog(id){document.querySelectorAll('dialog[open]').forEach(d=>d.close());$(id).showModal();pauseGame();}
// "Back to the dive" starts a fresh dive from the title screen, same as a reload.
function restart(){location.reload();}
function doAction(action){if(action==='restart'){restart();return;}document.querySelectorAll('dialog[open]').forEach(d=>d.close());if(action==='settings')openDialog('settings-dialog');if(action==='wardrobe')openWardrobe();}
function tick(){
  if(game&&['preview','answering'].includes(phase)&&!paused){
    const remaining=game.roundStart+ROUND_MS-now();
    if(now()<game.roundStart){const count=Math.max(1,Math.ceil((game.roundStart-now())/1000));$('preview-label').textContent=`descending · the clock starts in ${count}`;$('timer-number').textContent=count;document.documentElement.style.setProperty('--time',1);}
    else{
      if(phase==='preview'){setPhase('answering');$('answer').disabled=false;$('preview-label').textContent='';$('answer').focus({preventScroll:true});}
      $('submit-btn').disabled=busy||!$('answer').value.trim();
      const seconds=Math.max(0,Math.ceil(remaining/1000));
      document.body.classList.toggle('timer-hot',remaining<=3050);$('timer-number').textContent=seconds;
      document.documentElement.style.setProperty('--time',Math.max(0,remaining/ROUND_MS));
      document.documentElement.style.setProperty('--urgency',seconds<=3&&!scene.reduced?(1-seconds/4)*(.35+Math.sin(Date.now()*.012)*.2):0);
      if(seconds>0&&seconds<=3&&seconds!==lastTick){sound.event('tick');lastTick=seconds;}
      if(remaining<=0&&!autoSent&&!busy){autoSent=true;void submit(true);}
    }
  }else document.documentElement.style.setProperty('--urgency',0);
  if(game)$('depth').textContent=Math.round(scene.depth).toLocaleString('en-US')+'m';
}

$('start-btn').addEventListener('click',begin);$('menu-btn').addEventListener('click',()=>openDialog('menu-dialog'));$('settings-btn').addEventListener('click',()=>openDialog('settings-dialog'));$('wardrobe-btn').addEventListener('click',openWardrobe);$('next-btn').addEventListener('click',next);
$('mute-btn').addEventListener('click',async()=>{await sound.init();settings.muted=!settings.muted;write(SETTINGS_KEY,settings);applySettings();});$('mascot').addEventListener('click',async()=>{await sound.init();sound.event('blub');$('mascot').classList.remove('poked');void $('mascot').offsetWidth;$('mascot').classList.add('poked');setTimeout(()=>$('mascot').classList.remove('poked'),1000)});
$('answer-form').addEventListener('submit',e=>{e.preventDefault();void submit()});$('answer').addEventListener('input',()=>{const r=$('answer').getBoundingClientRect();scene.typeAt(r.left+14+Math.min(11*$('answer').value.length,r.width-28),r.top+5);if(paused)resumeGame();if(correction&&$('answer').value===correction.text)return tick();correction=null;$('answer-status').textContent='';$('answer-status').className='answer-status';tick();});
document.addEventListener('click',e=>{const close=e.target.closest('[data-close]');if(close){close.closest('dialog').close();resumeGame();}const action=e.target.closest('[data-action]');if(action)doAction(action.dataset.action);const r=e.target.closest('[data-review]');if(r)expandReview(r);const copy=e.target.closest('#copy-result');if(copy)void copyResult(copy);if(e.target.closest('#native-share'))navigator.share?.({text:resultText()}).catch(()=>{});const buddy=e.target.closest('[data-buddy]');if(buddy){settings.buddy=buddy.dataset.buddy;write(SETTINGS_KEY,settings);applySettings();openWardrobe()}});
document.addEventListener('change',e=>{if(e.target.matches('[data-setting]')){settings[e.target.dataset.setting]=e.target.checked;write(SETTINGS_KEY,settings);applySettings()}});
document.addEventListener('input',e=>{if(e.target.matches('.search-answers')){const text=e.target.value.toLowerCase();e.target.nextElementSibling.querySelectorAll('li').forEach(li=>li.hidden=!li.dataset.answer.includes(text));}});
document.querySelectorAll('dialog').forEach(d=>{d.addEventListener('close',resumeGame);d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom){d.close();resumeGame();}}})});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseGame();else resumeGame();});
document.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='f'&&!['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)&&!e.ctrlKey&&!e.metaKey){if(document.fullscreenElement)document.exitFullscreen?.();else $('game').requestFullscreen?.().catch(()=>{})}});
// Browsers only allow audio after a gesture; unlock it on the first tap or key.
for(const type of ['pointerdown','keydown'])document.addEventListener(type,()=>void sound.init(),{once:true});
function viewport(){const height=window.visualViewport?.height||innerHeight;document.documentElement.style.setProperty('--vh',height+'px')}viewport();window.visualViewport?.addEventListener('resize',viewport);window.addEventListener('resize',viewport);
window.render_game_to_text=()=>JSON.stringify({phase,prompt:game?PROMPTS[game.round]:null,round:game?.round??0,totalRounds:ROUNDS,score:Math.round(visualScore),targetScore:currentScore,depth:Math.round(scene.depth),targetDepth:scene.target,cameraDepth:Math.round(scene.cameraDepth),ending:game?.completed?(game.yes?'yes':'normal'):null,busy,submitDisabled:$('submit-btn').disabled,seconds:game&&!game.completed?Math.max(0,Math.ceil((game.roundStart+ROUND_MS-(paused?game.pausedAt:now()))/1000)):null,paused,status:$('answer-status').textContent,results:game?.results.map(r=>({raw:r.rawAnswer,answer:r.answer,tier:r.tier,score:r.score,kind:r.kind}))||[],draft:$('answer').value,sound:{supported:!!(window.AudioContext||window.webkitAudioContext),state:sound.ac?.state||'not-started',muted:sound.muted},coordinates:'origin at top-left, x rightward, y downward; depth in metres',lowPower:settings.lowPower});
window.advanceTime=async ms=>{if(!local)return;clockOffset+=Math.max(0,ms);scene.time+=ms/1000;scene.depth=scene.target;scene.active=scene.targetActive;scene.cameraDepth=scene.cameraTarget;scene.cameraJob=null;scene.draw();tick();await new Promise(r=>setTimeout(r,0));};
setInterval(tick,80);

// Old links with ?reset still work; every load starts at the title screen anyway.
(()=>{const params=new URLSearchParams(location.search);if(params.has('reset')){params.delete('reset');const query=params.toString();history.replaceState(null,'',location.pathname+(query?'?'+query:'')+location.hash);}})();
