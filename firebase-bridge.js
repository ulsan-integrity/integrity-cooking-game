// 청렴한 한끼 - Firebase 연결 템플릿
// 1) 이 파일을 firebase-bridge.js 로 이름 변경
// 2) 아래 firebaseConfig를 Firebase Console의 웹 앱 설정값으로 교체
// 3) GitHub 저장소 최상위(index.html과 같은 위치)에 업로드
// 작성 기준: Firebase Web SDK 12.11.0 browser ESM

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  serverTimestamp,
  runTransaction,
  getAggregateFromServer,
  count,
  sum,
  average
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

// ====== 반드시 본인의 Firebase 값으로 교체 ======
const firebaseConfig = {
  apiKey: "AIzaSyBxvAVZcNq64V2gChURTuUvpBAfHYHmIDI",
  authDomain: "integrity-cooking-game.firebaseapp.com",
  projectId: "integrity-cooking-game",
  storageBucket: "integrity-cooking-game.firebasestorage.app",
  messagingSenderId: "591921944081",
  appId: "1:591921944081:web:893420e5a5e6c8832ac3b0"
};
// ==============================================

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let currentSessionId = null;

function cleanNickname(value){
  return String(value || "").trim().replace(/\s*셰프님$/, "").slice(0, 12);
}

function validDifficulty(value){
  return ["basic", "practical", "expert"].includes(value) ? value : "basic";
}

async function ensureAuth(){
  if(auth.currentUser) return auth.currentUser;
  await signInAnonymously(auth);
  if(auth.currentUser) return auth.currentUser;
  return await new Promise((resolve, reject)=>{
    const off = onAuthStateChanged(auth, user=>{
      if(user){ off(); resolve(user); }
    }, err=>{ off(); reject(err); });
  });
}

async function startGame({nickname, difficulty}){
  const user = await ensureAuth();
  const uid = user.uid;
  const name = cleanNickname(nickname);
  const d = validDifficulty(difficulty);
  if(!name) throw new Error("닉네임이 비어 있습니다.");

  const playerRef = doc(db, "players", uid);
  await runTransaction(db, async tx=>{
    const snap = await tx.get(playerRef);
    if(snap.exists()){
      const old = snap.data();
      tx.update(playerRef, {
        nickname: name,
        gamesStarted: Number(old.gamesStarted || 0) + 1,
        updatedAt: serverTimestamp()
      });
    }else{
      tx.set(playerRef, {
        nickname: name,
        gamesStarted: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
  });

  const sessionRef = await addDoc(collection(db, "sessions"), {
    uid,
    nickname: name,
    difficulty: d,
    status: "started",
    startedAt: serverTimestamp()
  });
  currentSessionId = sessionRef.id;
  return {uid, sessionId: currentSessionId};
}

async function completeGame({nickname, difficulty, score, correct, maxStreak, answers}){
  const user = await ensureAuth();
  const uid = user.uid;
  const name = cleanNickname(nickname);
  const d = validDifficulty(difficulty);
  const safeScore = Math.max(0, Math.min(188, Number(score) || 0));
  const safeCorrect = Math.max(0, Math.min(10, Number(correct) || 0));
  const safeStreak = Math.max(0, Math.min(10, Number(maxStreak) || 0));
  const wrongQuestionIds = Array.isArray(answers)
    ? answers.filter(x=>!x.correct).map(x=>String(x.id || "")).filter(Boolean).slice(0,10)
    : [];

  // 시작 세션이 있으면 완료 처리합니다. 없으면 완료 세션을 새로 만듭니다.
  if(currentSessionId){
    await updateDoc(doc(db, "sessions", currentSessionId), {
      status: "completed",
      score: safeScore,
      correct: safeCorrect,
      maxStreak: safeStreak,
      wrongQuestionIds,
      completedAt: serverTimestamp()
    });
  }else{
    await addDoc(collection(db, "sessions"), {
      uid,
      nickname: name,
      difficulty: d,
      status: "completed",
      score: safeScore,
      correct: safeCorrect,
      maxStreak: safeStreak,
      wrongQuestionIds,
      startedAt: serverTimestamp(),
      completedAt: serverTimestamp()
    });
  }

  const rankRef = doc(db, "leaderboard", uid);
  await runTransaction(db, async tx=>{
    const snap = await tx.get(rankRef);
    if(!snap.exists()){
      tx.set(rankRef, {
        nickname: name,
        bestScore: safeScore,
        bestCorrect: safeCorrect,
        bestDifficulty: d,
        lastScore: safeScore,
        gamesCompleted: 1,
        bestAchievedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return;
    }

    const old = snap.data();
    const oldBest = Number(old.bestScore || 0);
    const oldCorrect = Number(old.bestCorrect || 0);
    const isNewBest = safeScore > oldBest || (safeScore === oldBest && safeCorrect > oldCorrect);

    tx.update(rankRef, {
      nickname: name,
      bestScore: isNewBest ? safeScore : oldBest,
      bestCorrect: isNewBest ? safeCorrect : oldCorrect,
      bestDifficulty: isNewBest ? d : (old.bestDifficulty || d),
      lastScore: safeScore,
      gamesCompleted: Number(old.gamesCompleted || 0) + 1,
      ...(isNewBest ? {bestAchievedAt: serverTimestamp()} : {}),
      updatedAt: serverTimestamp()
    });
  });

  currentSessionId = null;
}

async function getRanking(maxRows=10){
  await ensureAuth();
  const q = query(collection(db, "leaderboard"), orderBy("bestScore", "desc"), limit(50));
  const snap = await getDocs(q);
  const rows = snap.docs.map(d=>({uid:d.id, ...d.data()}));
  rows.sort((a,b)=>
    Number(b.bestScore||0)-Number(a.bestScore||0) ||
    Number(b.bestCorrect||0)-Number(a.bestCorrect||0)
  );
  return rows.slice(0, maxRows);
}

async function getPublicStats(){
  await ensureAuth();
  const coll = collection(db, "leaderboard");
  const snap = await getAggregateFromServer(coll, {
    players: count(),
    games: sum("gamesCompleted"),
    averageBest: average("bestScore")
  });
  const data = snap.data();
  return {
    players: Number(data.players || 0),
    games: Number(data.games || 0),
    averageBest: Number(data.averageBest || 0)
  };
}

window.IntegrityCloud = {
  startGame,
  completeGame,
  getRanking,
  getPublicStats,
  get uid(){ return auth.currentUser?.uid || null; }
};

// 페이지에서 연결상태를 확인할 수 있도록 이벤트 발생
window.dispatchEvent(new CustomEvent("integrity-cloud-ready"));
console.info("[청렴한 한끼] Firebase 연결 모듈 준비 완료");
