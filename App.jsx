import React, { useState, useEffect, useMemo } from 'react';
import { Camera, Plus, Trash2, Edit2, Save, X, Image as ImageIcon, Receipt, Calendar, NotebookText, Loader2, ListChecks, ChevronDown, FolderPlus, Map, Check, Cloud, Key, Settings, AlertCircle, RefreshCw } from 'lucide-react';

// Firebase 套件匯入
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

const CATEGORIES = ["交通", "飲食", "玩具", "伴手禮", "衣物", "藥妝", "其他"];

// --- 環境變數讀取 ---
const getEnv = (key) => {
  try { return import.meta.env[key] || null; } catch (e) { return null; }
};

let firebaseApp = null;
let firebaseAuth = null;
let firebaseDb = null;
let envError = null;

// 初始化 Firebase
const configStr = getEnv('VITE_FIREBASE_CONFIG');
if (!configStr) {
  envError = "找不到環境變數 VITE_FIREBASE_CONFIG";
} else {
  try {
    const config = JSON.parse(configStr.trim());
    firebaseApp = initializeApp(config);
    firebaseAuth = getAuth(firebaseApp);
    firebaseDb = getFirestore(firebaseApp);
  } catch (e) {
    envError = "Firebase 設定格式錯誤 (JSON Parse Error)";
  }
}

const appId = getEnv('VITE_APP_ID') || 'travel-expense-tracker';
const geminiApiKey = "AIzaSyDSbw1e4UlAC7Gzs1ogACQSAeG7cqODX1E"; 

const App = () => {
  if (envError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-sm w-full space-y-4">
          <AlertCircle className="mx-auto text-red-500" size={48} />
          <h1 className="text-xl font-bold">連線設定錯誤</h1>
          <p className="text-sm text-slate-500">{envError}</p>
          <button onClick={() => window.location.reload()} className="w-full bg-indigo-600 text-white py-3 rounded-2xl font-bold">重新整理</button>
        </div>
      </div>
    );
  }

  const [user, setUser] = useState(null);
  const [syncKey, setSyncKey] = useState(localStorage.getItem('travel_sync_key') || '');
  const [showSyncSettings, setShowSyncSettings] = useState(!localStorage.getItem('travel_sync_key'));
  const [tempSyncKey, setTempSyncKey] = useState('');

  const [trips, setTrips] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [activeTripId, setActiveTripId] = useState(null);
  const [showTripSelector, setShowTripSelector] = useState(false);
  const [newTripName, setNewTripName] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [view, setView] = useState('list');
  
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    item: '',
    amount: '',
    category: '飲食',
    note: ''
  });

  // 1. 認證
  useEffect(() => {
    if (!firebaseAuth) return;
    signInAnonymously(firebaseAuth).catch(e => console.error("匿名登入失敗:", e));
    return onAuthStateChanged(firebaseAuth, setUser);
  }, []);

  // 2. 數據監聽
  useEffect(() => {
    if (!user || !syncKey || !firebaseDb) return;

    const tripsColl = collection(firebaseDb, 'artifacts', appId, 'public', 'data', `trips_${syncKey}`);
    const expensesColl = collection(firebaseDb, 'artifacts', appId, 'public', 'data', `expenses_${syncKey}`);

    const unsubTrips = onSnapshot(tripsColl, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setTrips(data);
      if (data.length > 0) {
        if (!activeTripId) setActiveTripId(data[0].id);
      } else {
        createDefaultTrip(syncKey);
      }
    }, (err) => {
        if (err.code === 'permission-denied') {
            alert("資料庫存取被拒絕！請檢查 Firebase Firestore 的 Rules 是否已開啟。");
        }
    });

    const unsubExpenses = onSnapshot(expensesColl, (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => { unsubTrips(); unsubExpenses(); };
  }, [user, syncKey, activeTripId]);

  const createDefaultTrip = async (key) => {
    const coll = collection(firebaseDb, 'artifacts', appId, 'public', 'data', `trips_${key}`);
    await addDoc(coll, { name: '預設行程', createdAt: Date.now() });
  };

  const handleSetSyncKey = () => {
    if (!tempSyncKey.trim()) return;
    const cleanKey = tempSyncKey.trim().toUpperCase();
    setSyncKey(cleanKey);
    localStorage.setItem('travel_sync_key', cleanKey);
    setShowSyncSettings(false);
  };

  const currentExpenses = useMemo(() => expenses.filter(e => e.tripId === activeTripId), [expenses, activeTripId]);
  const dailyTotals = useMemo(() => {
    return currentExpenses.reduce((acc, curr) => {
      acc[curr.date] = (acc[curr.date] || 0) + Number(curr.amount);
      return acc;
    }, {});
  }, [currentExpenses]);

  const categoryTotals = useMemo(() => {
    return currentExpenses.reduce((acc, curr) => {
      acc[curr.category] = (acc[curr.category] || 0) + Number(curr.amount);
      return acc;
    }, {});
  }, [currentExpenses]);

  const totalAmount = currentExpenses.reduce((sum, curr) => sum + Number(curr.amount), 0);
  const sortedDates = Object.keys(dailyTotals).sort((a, b) => new Date(b) - new Date(a));

  const handleSaveExpense = async () => {
    if (!formData.item || !formData.amount || !syncKey) return;
    const coll = collection(firebaseDb, 'artifacts', appId, 'public', 'data', `expenses_${syncKey}`);
    await addDoc(coll, { ...formData, tripId: activeTripId, createdAt: Date.now() });
    setFormData({ date: new Date().toISOString().split('T')[0], item: '', amount: '', category: '飲食', note: '' });
    setView('list');
  };

  if (showSyncSettings) {
    return (
      <div className="min-h-screen bg-indigo-950 flex items-center justify-center p-6 text-white">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center"><Key className="mx-auto mb-4" size={48} /><h1 className="text-2xl font-black">輸入同步金鑰</h1></div>
          <input 
            type="text" placeholder="例如: JAPAN_2024"
            className="w-full bg-white/10 rounded-2xl py-4 text-center text-xl font-bold outline-none border border-white/20 uppercase"
            value={tempSyncKey} onChange={e => setTempSyncKey(e.target.value)}
          />
          <button onClick={handleSetSyncKey} className="w-full bg-indigo-500 py-4 rounded-2xl font-black shadow-lg">進入記帳本</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-24 text-[14px]">
      <header className="bg-indigo-950 text-white p-4 sticky top-0 z-30 shadow-lg">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <button onClick={() => setShowTripSelector(!showTripSelector)} className="flex items-center gap-2 bg-indigo-900/50 px-4 py-2 rounded-xl">
            <Map size={18} className="text-indigo-300" />
            <span className="font-bold">{activeTripId ? (trips.find(t => t.id === activeTripId)?.name) : '連線中...'}</span>
            <ChevronDown size={16} />
          </button>
          <Settings size={20} className="text-indigo-300" onClick={() => setShowSyncSettings(true)} />
        </div>
      </header>

      <main className="max-w-md mx-auto p-4">
        {isScanning && <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center text-white font-bold">AI 正在努力翻譯中...</div>}

        {view === 'list' ? (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="bg-gradient-to-br from-indigo-900 to-indigo-950 text-white p-6 rounded-[32px] shadow-2xl relative overflow-hidden">
                <p className="opacity-60 text-[10px] font-bold uppercase tracking-wider mb-1">行程總結算</p>
                <h2 className="text-4xl font-black mb-4">${totalAmount.toLocaleString()}</h2>
                <div className="h-px bg-white/10 my-4" />
                <div className="grid grid-cols-2 gap-2 text-xs opacity-80">
                    {CATEGORIES.map(c => categoryTotals[c] ? <div key={c}>{c}: ${categoryTotals[c].toLocaleString()}</div> : null)}
                </div>
            </div>

            {sortedDates.map(date => (
              <div key={date} className="space-y-2">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-tighter px-1">{date}</div>
                {currentExpenses.filter(e => e.date === date).map(item => (
                  <div key={item.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center">
                    <div>
                      <div className="font-bold text-slate-700">{item.item}</div>
                      <div className="text-[10px] text-slate-400">{item.category}</div>
                    </div>
                    <div className="font-black text-indigo-600">${Number(item.amount).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white p-6 rounded-3xl shadow-xl space-y-4 animate-in slide-in-from-bottom-4">
            <h2 className="font-bold text-lg">手動記帳</h2>
            <input type="text" placeholder="品名" className="w-full bg-slate-100 p-3 rounded-xl outline-none" value={formData.item} onChange={e => setFormData({...formData, item: e.target.value})} />
            <input type="number" placeholder="金額" className="w-full bg-slate-100 p-3 rounded-xl outline-none font-bold" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} />
            <div className="flex flex-wrap gap-1">
                {CATEGORIES.map(c => <button key={c} onClick={() => setFormData({...formData, category: c})} className={`px-3 py-1.5 rounded-full text-xs font-bold ${formData.category === c ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{c}</button>)}
            </div>
            <button onClick={handleSaveExpense} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black shadow-lg">儲存並同步</button>
            <button onClick={() => setView('list')} className="w-full text-slate-400 font-bold py-2">取消</button>
          </div>
        )}
      </main>

      {view === 'list' && (
        <div className="fixed bottom-8 left-0 right-0 flex justify-center items-center gap-4 px-6 pointer-events-none">
          <div className="bg-white/90 backdrop-blur-md p-2 rounded-full shadow-2xl border border-slate-200 flex gap-4 pointer-events-auto">
            <button className="w-12 h-12 bg-indigo-50 text-indigo-700 rounded-full flex flex-col items-center justify-center"><Camera size={18} /><span className="text-[8px] font-black">拍照</span></button>
            <button onClick={() => setView('form')} className="w-16 h-12 bg-indigo-950 text-white rounded-full flex items-center justify-center shadow-lg"><Plus size={28} /></button>
            <button className="w-12 h-12 bg-indigo-50 text-indigo-700 rounded-full flex flex-col items-center justify-center"><ImageIcon size={18} /><span className="text-[8px] font-black">相簿</span></button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;