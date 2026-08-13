// 청렴한 한끼 - Firebase 온라인 랭킹/게임 기록 연결
// v1.3.0 - 공용 랭킹, 통계, 문항 시도/오답 기록
import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, getDocs, query,
  orderBy, limit, serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
const db=getFirestore(app);
let currentSessionId=null;

function cleanNickname(value){return String(value||"").trim().replace(/\s*셰프님$/,"").slice(0,12)}
function validDifficulty(value){return ["basic","practical","expert"].includes(value)?value:"basic"}
function timestampMillis(value){
  if(!value)return Number.MAX_SAFE_INTEGER;
  if(typeof value.toMillis==="function")return value.toMillis();
  if(typeof value.seconds==="number")return value.seconds*1000+Math.floor((value.nanoseconds||0)/1e6);
  return Number.MAX_SAFE_INTEGER;
}
async function ensureAuth(){
  if(auth.currentUser)return auth.currentUser;
  await signInAnonymously(auth);
  if(auth.currentUser)return auth.currentUser;
  return await new Promise((resolve,reject)=>{
    const off=onAuthStateChanged(auth,user=>{if(user){off();resolve(user)}},err=>{off();reject(err)});
  });
}

async function startGame({nickname,difficulty}){
  const user=await ensureAuth();
  const uid=user.uid,name=cleanNickname(nickname),d=validDifficulty(difficulty);
  if(!name)throw new Error("닉네임이 비어 있습니다.");
  const playerRef=doc(db,"players",uid);
  await runTransaction(db,async tx=>{
    const snap=await tx.get(playerRef);
    if(snap.exists()){
      const old=snap.data();
      tx.update(playerRef,{nickname:name,gamesStarted:Number(old.gamesStarted||0)+1,updatedAt:serverTimestamp()});
    }else{
      tx.set(playerRef,{nickname:name,gamesStarted:1,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    }
  });
  const sessionRef=await addDoc(collection(db,"sessions"),{uid,nickname:name,difficulty:d,status:"started",startedAt:serverTimestamp()});
  currentSessionId=sessionRef.id;
  return {uid,sessionId:currentSessionId};
}

async function completeGame({nickname,difficulty,score,correct,maxStreak,answers}){
  const user=await ensureAuth();
  const uid=user.uid,name=cleanNickname(nickname),d=validDifficulty(difficulty);
  const safeScore=Math.max(0,Math.min(188,Math.trunc(Number(score)||0)));
  const safeCorrect=Math.max(0,Math.min(10,Math.trunc(Number(correct)||0)));
  const safeStreak=Math.max(0,Math.min(10,Math.trunc(Number(maxStreak)||0)));
  const safeAnswers=Array.isArray(answers)?answers.slice(0,10):[];
  const questionIds=safeAnswers.map(x=>String(x.id||"")).filter(Boolean);
  const wrongQuestionIds=safeAnswers.filter(x=>!x.correct).map(x=>String(x.id||"")).filter(Boolean);
  const completedPayload={status:"completed",score:safeScore,correct:safeCorrect,maxStreak:safeStreak,questionIds,wrongQuestionIds,completedAt:serverTimestamp()};
  if(currentSessionId){
    await updateDoc(doc(db,"sessions",currentSessionId),completedPayload);
  }else{
    await addDoc(collection(db,"sessions"),{uid,nickname:name,difficulty:d,status:"completed",startedAt:serverTimestamp(),...completedPayload});
  }
  const rankRef=doc(db,"leaderboard",uid);
  await runTransaction(db,async tx=>{
    const snap=await tx.get(rankRef);
    if(!snap.exists()){
      tx.set(rankRef,{nickname:name,bestScore:safeScore,bestCorrect:safeCorrect,bestDifficulty:d,lastScore:safeScore,gamesCompleted:1,bestAchievedAt:serverTimestamp(),updatedAt:serverTimestamp()});
      return;
    }
    const old=snap.data();
    const oldBest=Number(old.bestScore||0),oldCorrect=Number(old.bestCorrect||0);
    const isNewBest=safeScore>oldBest||(safeScore===oldBest&&safeCorrect>oldCorrect);
    tx.update(rankRef,{
      nickname:name,
      bestScore:isNewBest?safeScore:oldBest,
      bestCorrect:isNewBest?safeCorrect:oldCorrect,
      bestDifficulty:isNewBest?d:(old.bestDifficulty||d),
      lastScore:safeScore,
      gamesCompleted:Number(old.gamesCompleted||0)+1,
      ...(isNewBest?{bestAchievedAt:serverTimestamp()}:{}),
      updatedAt:serverTimestamp()
    });
  });
  currentSessionId=null;
}

async function getRanking(maxRows=20){
  await ensureAuth();
  const q=query(collection(db,"leaderboard"),orderBy("bestScore","desc"),limit(Math.max(50,Math.min(300,maxRows*5))));
  const snap=await getDocs(q);
  const rows=snap.docs.map(d=>({uid:d.id,...d.data()}));
  rows.sort((a,b)=>Number(b.bestScore||0)-Number(a.bestScore||0)||Number(b.bestCorrect||0)-Number(a.bestCorrect||0)||timestampMillis(a.bestAchievedAt)-timestampMillis(b.bestAchievedAt)||String(a.uid).localeCompare(String(b.uid)));
  return rows.slice(0,maxRows);
}

async function getPublicStats(){
  await ensureAuth();
  const snap=await getDocs(collection(db,"leaderboard"));
  let players=0,games=0,totalBestScore=0;
  snap.forEach(s=>{const data=s.data();players+=1;games+=Number(data.gamesCompleted||0);totalBestScore+=Number(data.bestScore||0)});
  return {players,games,averageBest:players?totalBestScore/players:0};
}

window.IntegrityCloud={startGame,completeGame,getRanking,getPublicStats,get uid(){return auth.currentUser?.uid||null}};
window.dispatchEvent(new CustomEvent("integrity-cloud-ready"));
console.info("[청렴한 한끼] Firebase 연결 모듈 준비 완료");
