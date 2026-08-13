import { firebaseConfig } from "./firebase-config.js";
import { QUESTION_BANK } from "./question-bank.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
const db=getFirestore(app);
const $=id=>document.getElementById(id);
const qMap=new Map(QUESTION_BANK.map(q=>[q.id,q]));
let cache={players:[],leaders:[],sessions:[]};

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function num(v){return Number(v||0)}
function timeMs(t){if(!t)return Number.MAX_SAFE_INTEGER;if(typeof t.toMillis==='function')return t.toMillis();if(typeof t.seconds==='number')return t.seconds*1000;return Number.MAX_SAFE_INTEGER}
function timestampText(t){const ms=timeMs(t);return ms===Number.MAX_SAFE_INTEGER?'—':new Date(ms).toLocaleString('ko-KR')}
function setStatus(msg,kind=''){const e=$('status');e.textContent=msg;e.className='status '+kind}
function csvEscape(v){const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
function downloadCsv(name,rows){const text='\ufeff'+rows.map(r=>r.map(csvEscape).join(',')).join('\n');const blob=new Blob([text],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)}

function sortLeaders(rows){return [...rows].sort((a,b)=>num(b.bestScore)-num(a.bestScore)||num(b.bestCorrect)-num(a.bestCorrect)||timeMs(a.bestAchievedAt)-timeMs(b.bestAchievedAt)||String(a.uid).localeCompare(String(b.uid)))}

async function fetchAll(){
  setStatus('통계를 불러오는 중입니다...');
  const [p,l,s]=await Promise.all([getDocs(collection(db,'players')),getDocs(collection(db,'leaderboard')),getDocs(collection(db,'sessions'))]);
  cache.players=p.docs.map(d=>({uid:d.id,...d.data()}));
  cache.leaders=l.docs.map(d=>({uid:d.id,...d.data()}));
  cache.sessions=s.docs.map(d=>({id:d.id,...d.data()}));
  renderDashboard();
  setStatus(`마지막 갱신: ${new Date().toLocaleString('ko-KR')}`,'ok');
}

function renderDashboard(){
  const sessions=cache.sessions;
  const completed=sessions.filter(s=>s.status==='completed');
  const totalStarts=cache.players.reduce((a,p)=>a+num(p.gamesStarted),0);
  const avg=completed.length?completed.reduce((a,s)=>a+num(s.score),0)/completed.length:0;
  const avgCorrect=completed.length?completed.reduce((a,s)=>a+num(s.correct),0)/completed.length:0;
  const completionRate=sessions.length?completed.length/sessions.length*100:0;
  $('statPlayers').textContent=cache.players.length.toLocaleString('ko-KR');
  $('statCompletedUsers').textContent=cache.leaders.length.toLocaleString('ko-KR');
  $('statStarts').textContent=totalStarts.toLocaleString('ko-KR');
  $('statGames').textContent=completed.length.toLocaleString('ko-KR');
  $('statAverage').textContent=avg.toFixed(1)+'점';
  $('statCorrect').textContent=avgCorrect.toFixed(1)+'/10';
  $('statCompletion').textContent=completionRate.toFixed(1)+'%';

  const diff={basic:0,practical:0,expert:0};completed.forEach(s=>{if(s.difficulty in diff)diff[s.difficulty]++});
  const labels={basic:'기본',practical:'실무',expert:'고난도'};
  $('difficultyBody').innerHTML=Object.entries(diff).map(([k,v])=>`<tr><td>${labels[k]}</td><td>${v.toLocaleString('ko-KR')}회</td><td>${completed.length?(v/completed.length*100).toFixed(1):'0.0'}%</td></tr>`).join('');

  const attempts=new Map(),wrong=new Map();
  completed.forEach(s=>{
    const qids=Array.isArray(s.questionIds)?s.questionIds:[];
    const wids=Array.isArray(s.wrongQuestionIds)?s.wrongQuestionIds:[];
    qids.forEach(id=>attempts.set(id,(attempts.get(id)||0)+1));
    wids.forEach(id=>wrong.set(id,(wrong.get(id)||0)+1));
  });
  const wrongRows=[...attempts.entries()].map(([id,a])=>({id,attempts:a,wrong:wrong.get(id)||0,rate:a?(wrong.get(id)||0)/a*100:0})).sort((a,b)=>b.rate-a.rate||b.wrong-a.wrong).slice(0,10);
  $('wrongBody').innerHTML=wrongRows.length?wrongRows.map((r,i)=>{const q=qMap.get(r.id);return `<tr><td>${i+1}</td><td><b>${esc(r.id)}</b><small>${esc(q?.category||'')}</small></td><td class="scenario">${esc(q?.scenario||'문항 정보 없음')}</td><td>${r.attempts}</td><td>${r.wrong}</td><td><b>${r.rate.toFixed(1)}%</b></td></tr>`}).join(''):'<tr><td colspan="6" class="empty">문항별 시도 기록이 아직 없습니다. v1.3 적용 이후 완료한 게임부터 정확한 오답률이 계산됩니다.</td></tr>';

  renderLeaderboard();
}

function renderLeaderboard(){
  const term=$('searchInput').value.trim().toLowerCase();
  let leaders=sortLeaders(cache.leaders);
  if(term)leaders=leaders.filter(x=>String(x.nickname||'').toLowerCase().includes(term)||String(x.uid).toLowerCase().includes(term));
  $('leaderBody').innerHTML=leaders.length?leaders.map((x,i)=>`<tr><td>${i+1}</td><td><b>${esc(x.nickname||'익명')}</b><small>${esc(x.uid)}</small></td><td>${num(x.bestScore)}</td><td>${num(x.bestCorrect)}/10</td><td>${num(x.gamesCompleted)}회</td><td>${timestampText(x.bestAchievedAt)}</td><td><div class="row-actions"><button class="mini-btn" data-action="rank" data-uid="${esc(x.uid)}">랭킹만 삭제</button><button class="mini-btn danger" data-action="all" data-uid="${esc(x.uid)}">전체 기록 삭제</button></div></td></tr>`).join(''):'<tr><td colspan="7" class="empty">조건에 맞는 랭킹 기록이 없습니다.</td></tr>';
}

async function deleteRanking(uid){if(!confirm('이 사용자의 leaderboard 기록만 삭제할까요? sessions와 players 기록은 남습니다.'))return;await deleteDoc(doc(db,'leaderboard',uid));await fetchAll()}
async function deleteAll(uid){
  if(!confirm('이 사용자의 Firestore 기록(players, leaderboard, sessions)을 모두 삭제할까요? Firebase Authentication 계정은 Console에서 별도로 삭제해야 합니다.'))return;
  const qs=await getDocs(query(collection(db,'sessions'),where('uid','==',uid)));
  for(const s of qs.docs)await deleteDoc(s.ref);
  await Promise.allSettled([deleteDoc(doc(db,'leaderboard',uid)),deleteDoc(doc(db,'players',uid))]);
  await fetchAll();
}
async function clearLeaderboard(){
  const phrase=prompt('전체 랭킹을 초기화하려면 정확히 "전체삭제"를 입력하세요. sessions와 players는 남습니다.');
  if(phrase!=='전체삭제')return;
  const snap=await getDocs(collection(db,'leaderboard'));
  for(const d of snap.docs)await deleteDoc(d.ref);
  await fetchAll();
}

async function clearAllOperationalData(){
  const first=confirm(
    '전체 운영데이터를 초기화하면 players, leaderboard, sessions의 모든 기록이 삭제됩니다.\n\n' +
    '참여자 수, 플레이 횟수, 랭킹, 평균 점수, 난이도 통계, 문항별 오답률이 모두 0으로 초기화됩니다.\n\n' +
    '이 작업은 되돌릴 수 없습니다. 계속할까요?'
  );
  if(!first)return;

  const phrase=prompt(
    '정말 전체 운영데이터를 초기화하려면 정확히 "운영데이터초기화"를 입력하세요.'
  );
  if(phrase!=='운영데이터초기화')return;

  setStatus('전체 운영데이터를 초기화하는 중입니다. 창을 닫지 마세요...');

  const [sessionSnap, leaderSnap, playerSnap]=await Promise.all([
    getDocs(collection(db,'sessions')),
    getDocs(collection(db,'leaderboard')),
    getDocs(collection(db,'players'))
  ]);

  // 브라우저와 Firestore에 무리가 가지 않도록 일정 개수씩 나누어 삭제합니다.
  const refs=[
    ...sessionSnap.docs.map(d=>d.ref),
    ...leaderSnap.docs.map(d=>d.ref),
    ...playerSnap.docs.map(d=>d.ref)
  ];

  const chunkSize=40;
  for(let i=0;i<refs.length;i+=chunkSize){
    const chunk=refs.slice(i,i+chunkSize);
    await Promise.all(chunk.map(ref=>deleteDoc(ref)));
  }

  cache={players:[],leaders:[],sessions:[]};
  await fetchAll();
  setStatus('전체 운영데이터 초기화가 완료되었습니다. 참여자·플레이·랭킹·통계가 0부터 다시 집계됩니다.','ok');
}

$('loginForm').addEventListener('submit',async e=>{e.preventDefault();setStatus('로그인 중...');try{await signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value);$('password').value=''}catch(err){console.error(err);setStatus('로그인 실패: '+(err.code||err.message),'error')}});
$('logoutBtn').addEventListener('click',()=>signOut(auth));
$('refreshBtn').addEventListener('click',()=>fetchAll().catch(handleLoadError));
$('searchInput').addEventListener('input',renderLeaderboard);
$('leaderBody').addEventListener('click',e=>{const b=e.target.closest('button[data-action]');if(!b)return;b.dataset.action==='rank'?deleteRanking(b.dataset.uid).catch(handleLoadError):deleteAll(b.dataset.uid).catch(handleLoadError)});
$('clearLeaderboardBtn').addEventListener('click',()=>clearLeaderboard().catch(handleLoadError));
$('clearAllDataBtn').addEventListener('click',()=>clearAllOperationalData().catch(handleLoadError));
$('exportRankBtn').addEventListener('click',()=>{const rows=[['순위','UID','닉네임','최고점','최고정답','완료횟수','최고점달성시각']];sortLeaders(cache.leaders).forEach((x,i)=>rows.push([i+1,x.uid,x.nickname,num(x.bestScore),num(x.bestCorrect),num(x.gamesCompleted),timestampText(x.bestAchievedAt)]));downloadCsv('청렴한_한끼_랭킹.csv',rows)});
$('exportSessionBtn').addEventListener('click',()=>{const rows=[['세션ID','UID','닉네임','난이도','상태','점수','정답','최대연속','문항ID','오답ID','완료시각']];cache.sessions.forEach(s=>rows.push([s.id,s.uid,s.nickname,s.difficulty,s.status,s.score??'',s.correct??'',s.maxStreak??'',Array.isArray(s.questionIds)?s.questionIds.join('|'):'',Array.isArray(s.wrongQuestionIds)?s.wrongQuestionIds.join('|'):'',timestampText(s.completedAt)]));downloadCsv('청렴한_한끼_게임기록.csv',rows)});

function handleLoadError(err){console.error(err);if(err?.code==='permission-denied')setStatus(`관리자 권한이 없습니다. 현재 로그인 UID ${auth.currentUser?.uid||'확인 불가'} 를 firestore.rules의 REPLACE_ADMIN_UID_HERE에 입력하고 Rules를 게시하세요.`,'error');else setStatus('데이터 처리 오류: '+(err?.code||err?.message||err),'error')}

onAuthStateChanged(auth,user=>{
  if(user){$('loginPanel').hidden=true;$('dashboard').hidden=false;$('adminIdentity').textContent=`${user.email||'관리자'} · UID ${user.uid}`;fetchAll().catch(handleLoadError)}
  else{$('loginPanel').hidden=false;$('dashboard').hidden=true;$('adminIdentity').textContent='로그인 필요';setStatus('관리자 계정으로 로그인하세요.')}
});
