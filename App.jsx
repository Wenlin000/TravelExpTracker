import React, { useState, useEffect, useMemo } from 'react';
import { Camera, Plus, Trash2, Edit2, Save, X, Image as ImageIcon, Receipt, Calendar, NotebookText, Loader2, ListChecks, ChevronDown, FolderPlus, Map, Check, Cloud, Key, Settings, AlertCircle } from 'lucide-react';

// Firebase Imports
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

const CATEGORIES = ["交通", "飲食", "玩具", "伴手禮", "衣物", "藥妝", "其他"];

// --- 環境變數讀取與安全檢查 ---
// 使用安全的方式存取 import.meta.env，避免在不支援的環境中導致編譯中斷
const getEnv = (key) => {
  try {
    // 優先從 import.meta.env 讀取 (Vite 標準)
    return import.meta.env[key];
  } catch (e) {
    return null;
  }
};

let firebaseConfig = null;
let envError = null;

try {
  const configStr = getEnv('VITE_FIREBASE_CONFIG');
  if (!configStr) {
    envError = "找不到環境變數 VITE_FIREBASE_CONFIG";
  } else {
    firebaseConfig = JSON.parse(configStr);
  }
} catch (e) {
  envError = "VITE_FIREBASE_CONFIG 格式錯誤，請確保它是正確的 JSON 字串";
}

// 只有在設定正確時才啟動 Firebase
let app, auth, db;
if (firebaseConfig) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (e) {
    envError = "Firebase 初始化失敗，請檢查設定內容";
  }
}

const appId = getEnv('VITE_APP_ID') || 'travel-expense-tracker';
const apiKey = "AIzaSyDSbw1e4UlAC7Gzs1ogACQSAeG7cqODX1E"; // 您的 Gemini API Key

const App = () => {
  // 如果有環境變數錯誤，直接顯示錯誤畫面
  if (envError) {
    return (
      <div className="min-h-screen bg-red-50 flex items-center justify-center p-6 text-red-800">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-sm w-full space-y-4 border border-red-200">
          <div className="flex justify-center text-red-500"><AlertCircle size={48} /></div>
          <h1 className="text-xl font-bold text-center">設定錯誤</h1>
          <p className="text-sm bg-red-100 p-3 rounded-xl font-mono break-all">{envError}</p>
          <p className="text-xs text-slate-500">請前往 Vercel 後台確認 Environment Variables 設定是否正確，並確保 Key 為 VITE_FIREBASE_CONFIG。</p>
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
  const [editingTripId, setEditingTripId] = useState(null);
  const [tempTripName, setTempTripName] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [view, setView] = useState('list');
  
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    item: '',
    amount: '',
    category: '飲食',
    note: ''
  });

  // Firebase Auth
  useEffect(() => {
    const initAuth = async () => {
      if (!auth) return;
      try {
        await signInAnonymously(auth);
      } catch (e) { console.error(e); }
    };
    initAuth();
    if (auth) return onAuthStateChanged(auth, setUser);
  }, []);

  // Firestore Listeners
  useEffect(() => {
    if (!user || !syncKey || !db) return;

    const tripsColl = collection(db, 'artifacts', appId, 'public', 'data', `trips_${syncKey}`);
    const expensesColl = collection(db, 'artifacts', appId, 'public', 'data', `expenses_${syncKey}`);

    const unsubTrips = onSnapshot(tripsColl, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setTrips(data);
      if (data.length > 0 && !activeTripId) setActiveTripId(data[0].id);
      else if (data.length === 0) createDefaultTrip(syncKey);
    }, (err) => console.error(err));

    const unsubExpenses = onSnapshot(expensesColl, (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.error(err));

    return () => { unsubTrips(); unsubExpenses(); };
  }, [user, syncKey, activeTripId]);

  const createDefaultTrip = async (key) => {
    if (!db) return;
    const coll = collection(db, 'artifacts', appId, 'public', 'data', `trips_${key}`);
    await addDoc(coll, { name: '我的第一趟旅行', createdAt: Date.now() });
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
    if (!formData.item || !formData.amount || !syncKey || !db) return;
    const coll = collection(db, 'artifacts', appId, 'public', 'data', `expenses_${syncKey}`);
    if (editingId) {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', `expenses_${syncKey}`, editingId), { ...formData, tripId: activeTripId });
    } else {
      await addDoc(coll, { ...formData, tripId: activeTripId, createdAt: Date.now() });
    }
    resetForm(); setView('list');
  };

  const handleAddTrip = async () => {
    if (!newTripName.trim() || !db) return;
    const coll = collection(db, 'artifacts', appId, 'public', 'data', `trips_${syncKey}`);
    const res = await addDoc(coll, { name: newTripName, createdAt: Date.now() });
    setActiveTripId(res.id); setNewTripName(''); setShowTripSelector(false);
  };

  const resetForm = () => {
    setFormData({ date: new Date().toISOString().split('T')[0], item: '', amount: '', category: '飲食', note: '' });
    setEditingId(null);
  };

  const processImage = async (base64) => {
    if (!syncKey || !activeTripId) return;
    setIsScanning(true);
    const prompt = `你是一位收據專家。將收據拆解品項，翻譯為繁體中文。只回傳 JSON：{"items": [{"date": "YYYY-MM-DD", "item": "品名", "amount": 100, "category": "飲食", "note": "AI自動辨識"}]}`;
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "辨識收據內容" }, { inlineData: { mimeType: "image/png", data: base64.split(',')[1] } }] }],
          systemInstruction: { parts: [{ text: prompt }] },
          generationConfig: { responseMimeType: "application/json" }
        })
      });
      const data = await res.json();
      const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (resultText) {
        const result = JSON.parse(resultText);
        const coll = collection(db, 'artifacts', appId, 'public', 'data', `expenses_${syncKey}`);
        for (const itm of result.items) {
          await addDoc(coll, { ...itm, tripId: activeTripId, createdAt: Date.now(), category: CATEGORIES.includes(itm.category) ? itm.category : '其他' });
        }
      }
      setView('list');
    } catch (e) { console.error(e); } finally { setIsScanning(false); }
  };

  if (showSyncSettings) {
    return (
      <div className="min-h-screen bg-indigo-950 flex items-center justify-center p-6 text-white text-[14px]">
        <div className="w-full max-w-sm space-y-8 animate-in fade-in zoom-in duration-300">
          <div className="text-center space-y-2">
            <div className="w-20 h-20 bg-indigo-600 rounded-3xl mx-auto flex items-center justify-center shadow-2xl mb-4"><Key size={40} /></div>
            <h1 className="text-3xl font-black">同步金鑰</h1>
            <p className="text-indigo-300 text-sm">輸入相同的金鑰即可與旅伴同步</p>
          </div>
          <div className="space-y-4 bg-white/10 p-6 rounded-3xl border border-white/10 backdrop-blur-xl">
            <input 
              type="text" 
              placeholder="例如：JAPAN_2024"
              className="w-full bg-indigo-900/50 border-0 rounded-2xl py-4 px-4 text-center font-black text-xl outline-none uppercase"
              value={tempSyncKey}
              onChange={(e) => setTempSyncKey(e.target.value)}
            />
            <button onClick={handleSetSyncKey} className="w-full bg-indigo-500 hover:bg-indigo-400 text-white font-black py-4 rounded-2xl shadow-xl active:scale-95 transition-all">開始記帳</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-24 text-[14px]">
      <header className="bg-indigo-950 text-white p-4 sticky top-0 shadow-md z-30">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <div className="relative">
            <button 
              onClick={() => { setShowTripSelector(!showTripSelector); setEditingTripId(null); }}
              className="flex items-center gap-2 bg-indigo-900/50 px-3 py-1.5 rounded-xl transition-colors hover:bg-indigo-900"
            >
              <Map size={18} className="text-indigo-300" />
              <span className="font-bold truncate max-w-[120px]">{activeTripId ? (trips.find(t => t.id === activeTripId)?.name) : '載入中...'}</span>
              <ChevronDown size={16} className={`transition-transform duration-200 ${showTripSelector ? 'rotate-180' : ''}`} />
            </button>
            {showTripSelector && (
              <div className="absolute top-full mt-2 left-0 w-72 bg-white text-slate-800 rounded-2xl shadow-2xl border p-2 animate-in fade-in zoom-in duration-200">
                {trips.map(trip => (
                  <div key={trip.id} onClick={() => { setActiveTripId(trip.id); setShowTripSelector(false); }} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl mb-1 cursor-pointer transition-colors ${activeTripId === trip.id ? 'bg-indigo-50 text-indigo-700 font-bold' : 'hover:bg-slate-50'}`}>
                    <span className="truncate">{trip.name}</span>
                    {activeTripId === trip.id && <Check size={16} />}
                  </div>
                ))}
                <div className="p-2 bg-slate-50 border-t flex gap-2">
                  <input type="text" placeholder="新行程..." className="flex-grow border rounded-lg px-2 py-1 text-xs outline-none focus:border-indigo-500" value={newTripName} onChange={e => setNewTripName(e.target.value)} />
                  <button onClick={handleAddTrip} className="bg-indigo-600 text-white p-1 rounded-lg"><FolderPlus size={18} /></button>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
             <button onClick={() => setShowSyncSettings(true)} className="p-2 text-indigo-300 transition-colors hover:text-white"><Settings size={20} /></button>
             {view !== 'list' && <button onClick={() => setView('list')} className="p-1"><X size={24} /></button>}
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4">
        {isScanning && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-md">
            <div className="bg-white p-8 rounded-3xl flex flex-col items-center gap-4 shadow-2xl">
              <Loader2 className="animate-spin text-indigo-600" size={48} />
              <p className="font-black text-indigo-950">AI 解析同步中...</p>
            </div>
          </div>
        )}

        {view === 'list' ? (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white p-5 rounded-3xl shadow-xl relative overflow-hidden">
              <div className="relative z-10">
                <p className="opacity-70 text-[10px] font-bold uppercase mb-1">行程總支出</p>
                <h2 className="text-3xl font-black mb-4 tracking-tighter">${totalAmount.toLocaleString()}</h2>
                <div className="grid grid-cols-2 gap-2 pt-4 border-t border-white/10">
                  {CATEGORIES.map(cat => categoryTotals[cat] ? (
                    <div key={cat} className="flex justify-between items-center text-xs">
                      <span className="opacity-60 font-medium">{cat}</span>
                      <span className="font-bold tracking-wide">${categoryTotals[cat].toLocaleString()}</span>
                    </div>
                  ) : null)}
                </div>
              </div>
              <Receipt className="absolute -right-4 -bottom-4 text-white/5 w-28 h-28 rotate-12" />
            </div>

            {sortedDates.length === 0 ? (
              <div className="text-center py-24 text-slate-300">
                <div className="flex justify-center mb-6 opacity-10"><NotebookText size={80} /></div>
                <p className="font-bold">尚無資料，請拍照或按 +</p>
              </div>
            ) : (
              sortedDates.map(date => (
                <div key={date} className="space-y-1.5">
                  <div className="flex justify-between items-center px-1 font-black text-[10px] text-slate-400">
                    <span className="flex items-center gap-1"><Calendar size={10} /> {date}</span>
                    <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">日計：${dailyTotals[date].toLocaleString()}</span>
                  </div>
                  <div className="space-y-1.5">
                    {currentExpenses.filter(e => e.date === date).map(item => (
                      <div key={item.id} className="bg-slate-100 px-4 py-2.5 rounded-xl border border-slate-200 flex items-center gap-3 active:scale-[0.98] transition-all cursor-pointer hover:bg-slate-200" onClick={() => { setFormData(item); setEditingId(item.id); setView('form'); }}>
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm shrink-0 shadow-sm ${
                          item.category === '飲食' ? 'bg-orange-50 text-orange-600' :
                          item.category === '交通' ? 'bg-blue-50 text-blue-600' :
                          item.category === '玩具' ? 'bg-purple-50 text-purple-600' :
                          item.category === '伴手禮' ? 'bg-pink-50 text-pink-600' :
                          item.category === '衣物' ? 'bg-emerald-50 text-emerald-600' :
                          item.category === '藥妝' ? 'bg-teal-50 text-teal-600' : 'bg-white text-slate-600'
                        }`}><span className="font-black leading-none">{item.category.charAt(0)}</span></div>
                        <div className="flex-grow min-w-0">
                          <h4 className="font-bold text-sm truncate text-slate-700 leading-tight">{item.item}</h4>
                          <p className="text-[10px] text-slate-400 truncate mt-0.5">{item.category} {item.note && `| ${item.note}`}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-black text-base text-slate-800 tracking-tight">${Number(item.amount).toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="bg-white rounded-3xl p-6 shadow-sm border space-y-4 animate-in slide-in-from-bottom-4 duration-300">
            <h2 className="text-lg font-bold flex items-center gap-2 text-indigo-900">{editingId ? <Edit2 size={18} /> : <Plus size={18} />}{editingId ? '編輯花費' : '新增紀錄'}</h2>
            <div className="space-y-4">
              <div><label className="text-xs font-bold text-slate-400 mb-1 block uppercase">日期</label><input type="date" className="w-full bg-slate-50 border-0 rounded-xl py-2.5 px-4 outline-none focus:ring-2 focus:ring-indigo-500 font-medium" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} /></div>
              <div><label className="text-xs font-bold text-slate-400 mb-1 block uppercase">品名</label><input type="text" placeholder="項目名稱" className="w-full bg-slate-50 border-0 rounded-xl py-2.5 px-4 outline-none focus:ring-2 focus:ring-indigo-500 font-medium" value={formData.item} onChange={e => setFormData({...formData, item: e.target.value})} /></div>
              <div><label className="text-xs font-bold text-slate-400 mb-1 block uppercase">金額</label><input type="number" placeholder="0" className="w-full bg-slate-50 border-0 rounded-xl py-2.5 px-4 outline-none focus:ring-2 focus:ring-indigo-500 font-black text-xl" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} /></div>
              <div>
                <label className="text-xs font-bold text-slate-400 mb-1 block uppercase">分類</label>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map(cat => (
                    <button key={cat} onClick={() => setFormData({...formData, category: cat})} className={`px-3 py-2 rounded-full text-xs font-bold transition-all ${formData.category === cat ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-500'}`}>{cat}</button>
                  ))}
                </div>
              </div>
              <button onClick={handleSaveExpense} className="w-full bg-indigo-600 text-white font-black py-3 rounded-2xl shadow-lg active:scale-95 transition-all">儲存同步至雲端</button>
            </div>
          </div>
        )}
      </main>

      {view === 'list' && (
        <div className="fixed bottom-6 left-0 right-0 px-6 flex justify-center items-center pointer-events-none">
          <div className="bg-white/95 backdrop-blur-xl p-2 rounded-full shadow-2xl border flex gap-4 pointer-events-auto">
            <label className="w-12 h-12 bg-indigo-50 text-indigo-700 rounded-full flex flex-col items-center justify-center cursor-pointer transition-all active:scale-90 overflow-hidden relative">
              <Camera size={18} /><span className="text-[8px] font-black mt-0.5">拍照</span>
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => {
                const file = e.target.files[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onloadend = () => processImage(reader.result);
                  reader.readAsDataURL(file);
                }
              }} />
            </label>
            <button onClick={() => { resetForm(); setView('form'); }} className="w-16 h-12 bg-indigo-950 text-white rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-all"><Plus size={28} /></button>
            <label className="w-12 h-12 bg-indigo-50 text-indigo-700 rounded-full flex flex-col items-center justify-center cursor-pointer transition-all active:scale-90 overflow-hidden relative">
              <ImageIcon size={18} /><span className="text-[8px] font-black mt-0.5">相簿</span>
              <input type="file" accept="image/*" className="hidden" onChange={e => {
                const file = e.target.files[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onloadend = () => processImage(reader.result);
                  reader.readAsDataURL(file);
                }
              }} />
            </label>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;