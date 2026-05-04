import React, { useState, useEffect, useMemo } from 'react';
import { Camera, Plus, Trash2, Edit2, Save, X, Image as ImageIcon, Receipt, Calendar, NotebookText, Loader2, ListChecks, ChevronDown, FolderPlus, Map, Check, Cloud, Key, Settings, Share2, Copy } from 'lucide-react';

// Firebase Imports
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

const CATEGORIES = ["交通", "飲食", "玩具", "伴手禮", "衣物", "藥妝", "其他"];

// Firebase Configuration
const firebaseConfig = JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = import.meta.env.VITE_APP_ID || 'ravel-expense-tracker';

const App = () => {
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

  const apiKey = "AIzaSyDSbw1e4UlAC7Gzs1ogACQSAeG7cqODX1E"; 

  // Firebase Auth
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) { console.error(e); }
    };
    initAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  // Firestore Listeners (Trips and Expenses using Sync Key)
  useEffect(() => {
    if (!user || !syncKey) return;

    // 定義基於 Sync Key 的集合路徑 (遵循 Rule 1)
    const tripsColl = collection(db, 'artifacts', appId, 'public', 'data', `trips_${syncKey}`);
    const expensesColl = collection(db, 'artifacts', appId, 'public', 'data', `expenses_${syncKey}`);

    const unsubTrips = onSnapshot(tripsColl, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setTrips(data);
      if (data.length > 0 && !activeTripId) setActiveTripId(data[0].id);
      else if (data.length === 0) createDefaultTrip(syncKey);
    });

    const unsubExpenses = onSnapshot(expensesColl, (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => { unsubTrips(); unsubExpenses(); };
  }, [user, syncKey, activeTripId]);

  const createDefaultTrip = async (key) => {
    const coll = collection(db, 'artifacts', appId, 'public', 'data', `trips_${key}`);
    await addDoc(coll, { name: '預設行程', createdAt: Date.now() });
  };

  const handleSetSyncKey = () => {
    if (!tempSyncKey.trim()) return;
    const cleanKey = tempSyncKey.trim().toUpperCase();
    setSyncKey(cleanKey);
    localStorage.setItem('travel_sync_key', cleanKey);
    setShowSyncSettings(false);
    setActiveTripId(null);
  };

  // Calculations
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

  // CRUD Actions
  const handleSaveExpense = async () => {
    if (!formData.item || !formData.amount || !syncKey) return;
    const coll = collection(db, 'artifacts', appId, 'public', 'data', `expenses_${syncKey}`);
    if (editingId) {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', `expenses_${syncKey}`, editingId), { ...formData, tripId: activeTripId });
    } else {
      await addDoc(coll, { ...formData, tripId: activeTripId, createdAt: Date.now() });
    }
    resetForm(); setView('list');
  };

  const handleAddTrip = async () => {
    if (!newTripName.trim()) return;
    const coll = collection(db, 'artifacts', appId, 'public', 'data', `trips_${syncKey}`);
    const res = await addDoc(coll, { name: newTripName, createdAt: Date.now() });
    setActiveTripId(res.id); setNewTripName(''); setShowTripSelector(false);
  };

  const handleUpdateTrip = async (id) => {
    if (!tempTripName.trim()) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', `trips_${syncKey}`, id), { name: tempTripName });
    setEditingTripId(null);
  };

  const handleDeleteTrip = async (e, id) => {
    e.stopPropagation();
    if (trips.length <= 1 || !window.confirm("刪除行程將連同帳目一併移除，確定嗎？")) return;
    const exps = expenses.filter(ex => ex.tripId === id);
    for (const ex of exps) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', `expenses_${syncKey}`, ex.id));
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', `trips_${syncKey}`, id));
    if (activeTripId === id) setActiveTripId(trips.find(t => t.id !== id)?.id);
  };

  const resetForm = () => {
    setFormData({ date: new Date().toISOString().split('T')[0], item: '', amount: '', category: '飲食', note: '' });
    setEditingId(null);
  };

  // AI OCR
  const processImage = async (base64) => {
    if (!syncKey || !activeTripId) return;
    setIsScanning(true);
    const prompt = `你是一位收據專家。將收據拆解品項，翻譯為繁體中文。只回傳 JSON：{"items": [{"date": "YYYY-MM-DD", "item": "品名", "amount": 100, "category": "飲食", "note": "AI自動辨識"}]}`;
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "辨識細項" }, { inlineData: { mimeType: "image/png", data: base64.split(',')[1] } }] }],
          systemInstruction: { parts: [{ text: prompt }] },
          generationConfig: { responseMimeType: "application/json" }
        })
      });
      const data = await res.json();
      const result = JSON.parse(data.candidates[0].content.parts[0].text);
      const coll = collection(db, 'artifacts', appId, 'public', 'data', `expenses_${syncKey}`);
      for (const itm of result.items) {
        await addDoc(coll, { ...itm, tripId: activeTripId, createdAt: Date.now(), category: CATEGORIES.includes(itm.category) ? itm.category : '其他' });
      }
      setView('list');
    } catch (e) { console.error(e); } finally { setIsScanning(false); }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => processImage(reader.result);
      reader.readAsDataURL(file);
    }
  };

  if (showSyncSettings) {
    return (
      <div className="min-h-screen bg-indigo-950 flex items-center justify-center p-6 text-white">
        <div className="w-full max-w-sm space-y-8 animate-in fade-in zoom-in duration-500">
          <div className="text-center space-y-2">
            <div className="w-20 h-20 bg-indigo-600 rounded-3xl mx-auto flex items-center justify-center shadow-2xl shadow-indigo-500/20 mb-4">
              <Key size={40} />
            </div>
            <h1 className="text-3xl font-black">同步金鑰設定</h1>
            <p className="text-indigo-300 text-sm">輸入金鑰即可在不同裝置同步資料</p>
          </div>
          <div className="space-y-4 bg-white/10 p-6 rounded-3xl border border-white/10 backdrop-blur-xl">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-indigo-300 mb-2 block">您的金鑰 (自訂英文或數字)</label>
              <input 
                type="text" 
                placeholder="例如：TRIP_2024"
                className="w-full bg-indigo-900/50 border-0 rounded-2xl py-4 px-4 text-center font-black text-xl tracking-widest outline-none focus:ring-2 focus:ring-indigo-500 transition-all uppercase"
                value={tempSyncKey}
                onChange={(e) => setTempSyncKey(e.target.value)}
              />
            </div>
            <button 
              onClick={handleSetSyncKey}
              className="w-full bg-indigo-500 hover:bg-indigo-400 text-white font-black py-4 rounded-2xl shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              開始同步 <Check size={20} />
            </button>
            <p className="text-[10px] text-center text-indigo-300 opacity-60">提示：與旅伴輸入相同的金鑰即可共同記帳</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-24 text-[14px]">
      {/* Header */}
      <header className="bg-indigo-950 text-white p-4 sticky top-0 shadow-md z-30">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <div className="relative">
            <button 
              onClick={() => { setShowTripSelector(!showTripSelector); setEditingTripId(null); }}
              className="flex items-center gap-2 bg-indigo-900/50 px-3 py-1.5 rounded-xl hover:bg-indigo-900 transition-colors"
            >
              <Map size={18} className="text-indigo-300" />
              <span className="font-bold truncate max-w-[120px]">{activeTripId ? (trips.find(t => t.id === activeTripId)?.name) : '載入中...'}</span>
              <ChevronDown size={16} className={`transition-transform ${showTripSelector ? 'rotate-180' : ''}`} />
            </button>

            {showTripSelector && (
              <div className="absolute top-full mt-2 left-0 w-72 bg-white text-slate-800 rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-2 max-h-80 overflow-y-auto">
                  <p className="text-[10px] font-bold text-slate-400 px-3 py-1 uppercase tracking-wider">我的行程</p>
                  {trips.map(trip => (
                    <div key={trip.id} onClick={() => { if(!editingTripId) { setActiveTripId(trip.id); setShowTripSelector(false); } }} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl mb-1 cursor-pointer ${activeTripId === trip.id ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50'}`}>
                      <div className="flex items-center gap-3 flex-grow min-w-0">
                        {activeTripId === trip.id ? <Check size={16} /> : <div className="w-4" />}
                        {editingTripId === trip.id ? (
                          <input autoFocus className="flex-grow outline-none border-b-2 border-indigo-600 px-1 font-bold" value={tempTripName} onChange={(e) => setTempTripName(e.target.value)} onClick={e => e.stopPropagation()} />
                        ) : (
                          <span className="truncate font-bold">{trip.name}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {editingTripId === trip.id ? (
                          <button onClick={e => { e.stopPropagation(); handleUpdateTrip(trip.id); }} className="p-1.5 bg-indigo-600 text-white rounded-lg"><Save size={14} /></button>
                        ) : (
                          <>
                            <button onClick={e => { e.stopPropagation(); setEditingTripId(trip.id); setTempTripName(trip.name); }} className="p-1.5 text-slate-300 hover:text-indigo-600 rounded-lg"><Edit2 size={14} /></button>
                            {trips.length > 1 && <button onClick={e => handleDeleteTrip(e, trip.id)} className="p-1.5 text-slate-300 hover:text-red-600 rounded-lg"><Trash2 size={14} /></button>}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-3 bg-slate-50 border-t flex gap-2">
                  <input type="text" placeholder="新行程..." className="flex-grow border rounded-lg px-2 py-2 text-sm outline-none" value={newTripName} onChange={e => setNewTripName(e.target.value)} />
                  <button onClick={handleAddTrip} className="bg-indigo-600 text-white p-2 rounded-lg"><FolderPlus size={18} /></button>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {view === 'list' ? (
              <button onClick={() => setShowSyncSettings(true)} className="p-2 bg-indigo-900/50 rounded-xl text-indigo-300"><Settings size={20} /></button>
            ) : (
              <button onClick={() => setView('list')} className="p-1 hover:bg-indigo-800 rounded-full"><X size={24} /></button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4">
        {isScanning && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-md">
            <div className="bg-white p-8 rounded-3xl flex flex-col items-center gap-4 shadow-2xl">
              <Loader2 className="animate-spin text-indigo-600" size={48} />
              <p className="font-black text-indigo-950">AI 正在深度解析中...</p>
            </div>
          </div>
        )}

        {view === 'list' ? (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 text-white p-5 rounded-3xl shadow-xl relative overflow-hidden group">
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-1">
                  <p className="opacity-70 text-[10px] font-bold uppercase tracking-widest">總支出總額</p>
                  <div className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded-lg text-[9px] font-bold">
                    <Cloud size={10} className="text-indigo-400" /> 同步中：{syncKey}
                  </div>
                </div>
                <h2 className="text-3xl font-black mb-4 tracking-tighter">${totalAmount.toLocaleString()}</h2>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-4 border-t border-white/10">
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
                  <div className="flex justify-between items-center px-1">
                    <h3 className="font-black text-slate-400 text-[10px] uppercase flex items-center gap-1"><Calendar size={10} /> {date}</h3>
                    <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">日計：${dailyTotals[date].toLocaleString()}</span>
                  </div>
                  <div className="space-y-1.5">
                    {currentExpenses.filter(e => e.date === date).map(item => (
                      <div key={item.id} className="bg-slate-100 px-4 py-2.5 rounded-xl border border-slate-200 flex items-center gap-3 active:scale-[0.98] transition-transform cursor-pointer" onClick={() => { setFormData(item); setEditingId(item.id); setView('form'); }}>
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm shrink-0 shadow-sm border border-white/50 ${
                          item.category === '飲食' ? 'bg-orange-50 text-orange-600' :
                          item.category === '交通' ? 'bg-blue-50 text-blue-600' :
                          item.category === '玩具' ? 'bg-purple-50 text-purple-600' :
                          item.category === '伴手禮' ? 'bg-pink-50 text-pink-600' :
                          item.category === '衣物' ? 'bg-emerald-50 text-emerald-600' :
                          item.category === '藥妝' ? 'bg-teal-50 text-teal-600' : 'bg-white text-slate-600'
                        }`}><span className="font-black leading-none">{item.category.charAt(0)}</span></div>
                        <div className="flex-grow min-w-0">
                          <h4 className="font-bold text-sm truncate text-slate-700 leading-tight">{item.item}</h4>
                          <p className="text-[10px] text-slate-400 truncate mt-0.5 font-medium">{item.category} {item.note && `| ${item.note}`}</p>
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
          /* Form UI */
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-4 animate-in slide-in-from-bottom-4 duration-300">
            <h2 className="text-lg font-bold flex items-center gap-2 text-indigo-900">{editingId ? <Edit2 size={18} /> : <Plus size={18} />}{editingId ? '修改花費' : '手動新增紀錄'}</h2>
            <div className="space-y-3">
              <div><label className="text-xs font-bold text-slate-400 mb-1 block uppercase tracking-wider">日期</label><input type="date" className="w-full bg-slate-50 border-0 rounded-xl py-2.5 px-4 focus:ring-2 focus:ring-indigo-500 font-medium" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} /></div>
              <div><label className="text-xs font-bold text-slate-400 mb-1 block uppercase tracking-wider">品名</label><input type="text" placeholder="項目名稱" className="w-full bg-slate-50 border-0 rounded-xl py-2.5 px-4 focus:ring-2 focus:ring-indigo-500 font-medium" value={formData.item} onChange={e => setFormData({...formData, item: e.target.value})} /></div>
              <div><label className="text-xs font-bold text-slate-400 mb-1 block uppercase tracking-wider">金額</label><input type="number" className="w-full bg-slate-50 border-0 rounded-xl py-2.5 px-4 font-black focus:ring-2 focus:ring-indigo-500 text-xl" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} /></div>
              <div>
                <label className="text-xs font-bold text-slate-400 mb-1 block uppercase tracking-wider">分類</label>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map(cat => (
                    <button key={cat} onClick={() => setFormData({...formData, category: cat})} className={`px-3 py-2 rounded-full text-xs font-bold transition-all ${formData.category === cat ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{cat}</button>
                  ))}
                </div>
              </div>
              <div><label className="text-xs font-bold text-slate-400 mb-1 block uppercase tracking-wider">備註</label><textarea className="w-full bg-slate-50 border-0 rounded-xl py-2.5 px-4 h-16 focus:ring-2 focus:ring-indigo-500 text-sm font-medium resize-none" value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})} /></div>
              <div className="pt-2 flex gap-3">
                {editingId && <button onClick={async () => { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', `expenses_${syncKey}`, editingId)); setView('list'); }} className="flex-1 bg-red-50 text-red-600 font-bold py-3 rounded-2xl active:bg-red-100"><Trash2 className="mx-auto" size={20} /></button>}
                <button onClick={handleSaveExpense} className="flex-[3] bg-indigo-600 text-white font-black py-3 rounded-2xl shadow-lg active:bg-indigo-700 active:scale-[0.98] transition-all">儲存並同步雲端</button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* FAB */}
      {view === 'list' && (
        <div className="fixed bottom-0 left-0 right-0 p-6 flex justify-center items-center pointer-events-none">
          <div className="bg-white/95 backdrop-blur-xl p-2 rounded-full shadow-2xl border border-slate-200 flex gap-4 pointer-events-auto">
            <label className="w-14 h-14 bg-indigo-50 text-indigo-700 rounded-full flex flex-col items-center justify-center cursor-pointer hover:bg-indigo-100 active:scale-90 transition-all overflow-hidden relative">
              <Camera size={20} /><span className="text-[10px] font-black mt-0.5">拍照</span>
              <input type="file" accept="image/*" capture="environment" className="absolute inset-0 opacity-0" onChange={handleFileUpload} />
            </label>
            <button onClick={() => { resetForm(); setView('form'); }} className="w-20 h-14 bg-indigo-950 text-white rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-all"><Plus size={32} /></button>
            <label className="w-14 h-14 bg-indigo-50 text-indigo-700 rounded-full flex flex-col items-center justify-center cursor-pointer hover:bg-indigo-100 active:scale-90 transition-all overflow-hidden relative">
              <ImageIcon size={20} /><span className="text-[10px] font-black mt-0.5">相簿</span>
              <input type="file" accept="image/*" className="absolute inset-0 opacity-0" onChange={handleFileUpload} />
            </label>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;