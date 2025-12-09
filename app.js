/* filename: app.js */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
// Added writeBatch for archiving
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, setDoc, getDoc, runTransaction, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyDAcC-tFMZPUpbXNEbPgEmm5zbFqwZgbJs",
    authDomain: "projectracer-4b315.firebaseapp.com",
    projectId: "projectracer-4b315",
    storageBucket: "projectracer-4b315.firebasestorage.app",
    messagingSenderId: "1010090408562",
    appId: "1:1010090408562:web:482a841c4823c114a4a0eb",
    measurementId: "G-9HHRZJCBM5"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const APP_ID = "race-tracker-v1"; 

// State
let currentUser = null;
let isAdmin = false;
let racersData = [];
let raceConfig = { name: "Grand Prix", totalLaps: 0 };
let currentEditingRacerId = null;

// --- DOM Cache ---
const els = {
    loginModal: document.getElementById('loginModal'),
    adminControls: document.getElementById('adminControls'),
    liveView: document.getElementById('liveView'),
    historyView: document.getElementById('historyView'),
    manageView: document.getElementById('manageView'),
    driverDetailView: document.getElementById('driverDetailView'),
    leaderboardBody: document.getElementById('leaderboardBody'),
    podiumContainer: document.getElementById('podiumContainer'),
    adminRacerList: document.getElementById('adminRacerList'),
    historyList: document.getElementById('historyList'),
    historyCount: document.getElementById('historyCount'),
    raceName: document.getElementById('displayRaceName'),
    raceStats: document.getElementById('displayRaceStats'),
    configName: document.getElementById('configRaceName'),
    configLaps: document.getElementById('configTotalLaps'),
    toast: document.getElementById('toast'),
    // Edit View Els
    editId: document.getElementById('editDriverId'),
    editName: document.getElementById('editDriverName'),
    editNumber: document.getElementById('editDriverNumber'),
    detailLapList: document.getElementById('detailLapList'),
    detailTotalLaps: document.getElementById('detailTotalLaps'),
    // Tabs
    tabLive: document.getElementById('tabLive'),
    tabHistory: document.getElementById('tabHistory')
};

// --- Initialization ---
async function init() {
    try { await signInAnonymously(auth); } catch (e) { showToast("Auth Error", "Could not connect", true); }
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        setupListeners();
    }
});

// --- Data Logic ---
function setupListeners() {
    // Config Listener
    onSnapshot(doc(db, 'artifacts', APP_ID, 'public', 'data', 'config', 'main'), (doc) => {
        if (doc.exists()) {
            raceConfig = doc.data();
            updateRaceHeader();
            if(isAdmin) {
                els.configName.value = raceConfig.name || "";
                els.configLaps.value = raceConfig.totalLaps || "";
            }
        }
    });

    // Racers Listener
    onSnapshot(collection(db, 'artifacts', APP_ID, 'public', 'data', 'racers'), (snapshot) => {
        const racers = [];
        snapshot.forEach(doc => racers.push({ id: doc.id, ...doc.data() }));
        
        // SORT LOGIC: 
        // 1. Total Laps Completed (Descending)
        // 2. Total Time Raced (Ascending)
        racersData = racers.sort((a, b) => {
            const lapsA = a.laps ? a.laps.length : 0;
            const lapsB = b.laps ? b.laps.length : 0;

            // 1. Driver with MORE laps is ahead
            if (lapsA !== lapsB) return lapsB - lapsA;

            // 2. If laps are equal, Driver with LESS total time is ahead
            const timeA = calculateTotalTime(a.laps);
            const timeB = calculateTotalTime(b.laps);
            
            if (lapsA === 0) return 0; // Both have 0 laps
            
            return timeA - timeB;
        });

        renderLiveView();
        renderAdminList();
        
        if (currentEditingRacerId) renderDriverDetail(currentEditingRacerId);
    });

    // History Listener
    onSnapshot(collection(db, 'artifacts', APP_ID, 'public', 'data', 'history'), (snapshot) => {
        const history = [];
        snapshot.forEach(doc => history.push({ id: doc.id, ...doc.data() }));
        const sortedHistory = history.sort((a,b) => b.date - a.date);
        renderHistoryList(sortedHistory);
    });
}

// --- Helpers ---
function formatTime(ms) {
    if (!ms && ms !== 0) return "--:--.--";
    const min = Math.floor(ms / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    const mill = Math.floor((ms % 1000) / 10);
    return `${min}:${sec.toString().padStart(2, '0')}.${mill.toString().padStart(2, '0')}`;
}

function calculateTotalTime(lapsArray) {
    if(!lapsArray || lapsArray.length === 0) return 0;
    return lapsArray.reduce((acc, curr) => acc + curr, 0);
}

function toggleButtonLoading(btnElement, isLoading) {
    if (!btnElement) return;
    if (isLoading) {
        btnElement.dataset.originalText = btnElement.innerHTML;
        btnElement.disabled = true;
        btnElement.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i>`;
        btnElement.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
        btnElement.disabled = false;
        if(btnElement.dataset.originalText) btnElement.innerHTML = btnElement.dataset.originalText;
        btnElement.classList.remove('opacity-50', 'cursor-not-allowed');
    }
}

// --- Rendering ---
function updateRaceHeader() {
    els.raceName.innerText = raceConfig.name || "Grand Prix";
    els.raceStats.innerText = `${raceConfig.totalLaps ? raceConfig.totalLaps + ' LAPS' : 'PRACTICE'} • ${racersData.length} DRIVERS`;
}

function renderLiveView() {
    els.leaderboardBody.innerHTML = '';
    
    // Leader is Index 0 because we already sorted by Laps Desc / Time Asc
    const leader = racersData[0];
    const leaderLaps = leader?.laps?.length || 0;
    const leaderTime = calculateTotalTime(leader?.laps);

    if(racersData.length === 0) {
        els.leaderboardBody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-gray-500 font-mono text-xs">WAITING FOR ENTRIES</td></tr>`;
    }

    // Try to update the static HTML header if possible to match new data (Optional UX improvement)
    const tableHeader = document.querySelector('#leaderboardBody').parentElement.querySelector('thead tr th:nth-child(5)');
    if(tableHeader && tableHeader.innerText === "Best Lap") {
        tableHeader.innerText = "Total Time";
    }

    racersData.forEach((racer, index) => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-white/5 transition group border-b border-gray-800/50 last:border-0";
        
        const rLaps = racer.laps ? racer.laps.length : 0;
        const rTime = calculateTotalTime(racer.laps);
        const hasRaced = rLaps > 0;

        // Gap Calculation
        let gap = `<span class="text-gray-600">-</span>`;
        if (index > 0 && leaderLaps > 0 && hasRaced) {
            if (rLaps < leaderLaps) {
                // Gap in Laps
                const lapDiff = leaderLaps - rLaps;
                gap = `<span class="text-[var(--neon-red)] font-mono text-[10px] md:text-xs">+${lapDiff} Lap${lapDiff > 1 ? 's' : ''}</span>`;
            } else {
                // Same Laps: Gap in Time
                const timeDiff = (rTime - leaderTime) / 1000;
                gap = `<span class="text-[var(--neon-red)] font-mono text-[10px] md:text-xs">+${timeDiff.toFixed(2)}s</span>`;
            }
        }

        let rank = `<span class="font-mono text-gray-500 text-xs md:text-sm">P${index + 1}</span>`;
        if (index === 0 && hasRaced) rank = `<span class="bg-[var(--neon-green)] text-black font-bold px-2 rounded text-[10px] md:text-xs">P1</span>`;
        
        const maxLaps = raceConfig.totalLaps || 0;
        const lapDisplay = maxLaps > 0 ? `${rLaps}<span class="text-gray-600">/${maxLaps}</span>` : rLaps;

        // DISPLAY UPDATE: Show Total Time instead of Best Lap
        tr.innerHTML = `
            <td class="p-3 md:p-4 text-center">${rank}</td>
            <td class="p-3 md:p-4 font-mono text-gray-400 group-hover:text-white transition text-xs md:text-sm">#${racer.number}</td>
            <td class="p-3 md:p-4 font-bold text-gray-200 group-hover:text-white text-sm md:text-base">${racer.name}</td>
            <td class="p-3 md:p-4 text-center font-mono text-gray-400 text-xs hidden md:table-cell">${lapDisplay}</td>
            <td class="p-3 md:p-4 text-right font-mono text-[var(--neon-blue)] text-sm md:text-base">${formatTime(rTime)}</td>
            <td class="p-3 md:p-4 text-right hidden md:table-cell">${gap}</td>
        `;
        els.leaderboardBody.appendChild(tr);
    });

    els.podiumContainer.innerHTML = '';
    // Winners logic: Top 3 from sorted list
    const winners = racersData.filter(r => r.laps && r.laps.length > 0).slice(0, 3);
    
    if (winners.length === 0) {
        els.podiumContainer.innerHTML = `<div class="text-gray-600 font-mono text-sm">NO DATA AVAILABLE</div>`;
        return;
    }

    const visualOrder = [1, 0, 2];
    visualOrder.forEach(placeIndex => {
        if (winners[placeIndex]) {
            const racer = winners[placeIndex];
            const realRank = placeIndex + 1;
            const rTime = calculateTotalTime(racer.laps);
            
            let styles = {
                1: { h: 'h-32 md:h-56', bg: 'bg-[var(--neon-green)]', order: 'order-2', scale: 'scale-110 z-10', text: 'text-black' },
                2: { h: 'h-20 md:h-40', bg: 'bg-gray-300', order: 'order-1', scale: 'scale-100 mt-8', text: 'text-black' },
                3: { h: 'h-16 md:h-32', bg: 'bg-orange-600', order: 'order-3', scale: 'scale-95 mt-12', text: 'text-white' }
            }[realRank];

            const bar = document.createElement('div');
            bar.className = `${styles.order} flex flex-col items-center justify-end w-1/3 max-w-[120px] podium-bar ${styles.scale}`;
            
            // DISPLAY UPDATE: Show Total Time in Podium
            bar.innerHTML = `
                <div class="mb-3 text-center w-full">
                    <div class="text-[10px] text-gray-400 font-mono mb-1">#${racer.number}</div>
                    <div class="font-bold truncate w-full px-1 text-xs md:text-sm text-gray-200">${racer.name}</div>
                    <div class="font-mono text-[10px] text-[var(--neon-green)]">${formatTime(rTime)}</div>
                </div>
                <div class="w-full ${styles.h} ${styles.bg} rounded-t-lg shadow-[0_0_20px_rgba(0,0,0,0.5)] relative flex items-start justify-center pt-2 border-x border-t border-white/20">
                    <span class="${styles.text} font-black text-xl md:text-2xl opacity-40">${realRank}</span>
                </div>
            `;
            els.podiumContainer.appendChild(bar);
        }
    });

    document.getElementById('lastUpdated').innerText = `UPDATED: ${new Date().toLocaleTimeString()}`;
}

// History Render
function renderHistoryList(historyData) {
    els.historyCount.innerText = `${historyData.length} Races Archived`;
    els.historyList.innerHTML = '';

    if (historyData.length === 0) {
        els.historyList.innerHTML = `<div class="col-span-full text-center p-8 text-gray-600 font-mono">No archives found</div>`;
        return;
    }

    historyData.forEach(race => {
        const date = new Date(race.date).toLocaleDateString();
        const card = document.createElement('div');
        card.className = "glass-panel p-4 rounded-xl border border-gray-800 hover:border-gray-600 transition flex flex-col gap-3";
        
        let podiumHtml = '';
        if (race.podium) {
            // DISPLAY UPDATE: Show Total Time in History
            podiumHtml = race.podium.map((p, i) => `
                <div class="flex justify-between items-center text-xs font-mono border-b border-gray-800 pb-1 last:border-0">
                    <span class="${i===0 ? 'text-[var(--neon-green)] font-bold' : 'text-gray-400'}">P${i+1} ${p.name}</span>
                    <span class="text-gray-500">${formatTime(p.totalTime || p.best)}</span>
                </div>
            `).join('');
        }

        card.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <h3 class="font-bold text-white text-lg leading-tight">${race.raceName}</h3>
                    <span class="text-[10px] text-gray-500 font-mono uppercase tracking-widest">${date}</span>
                </div>
                <i class="fa-solid fa-trophy text-yellow-500/50 text-xl"></i>
            </div>
            <div class="bg-black/30 rounded p-2 gap-1 flex flex-col">${podiumHtml}</div>
            <div class="mt-auto pt-2 text-[10px] text-gray-500 text-center uppercase tracking-wider">
                ${race.totalDrivers || '-'} Drivers • ${race.totalLaps || '-'} Laps
            </div>
        `;
        els.historyList.appendChild(card);
    });
}

function renderAdminList() {
    if (!isAdmin) return;

    els.adminRacerList.innerHTML = '';
    const sortedByNum = [...racersData].sort((a,b) => String(a.number).localeCompare(String(b.number)));

    sortedByNum.forEach(racer => {
        const laps = racer.laps || [];
        const totalTime = calculateTotalTime(laps);
        const best = racer.bestLap || 0;
        
        const div = document.createElement('div');
        div.className = "bg-black/40 border border-gray-700 rounded-lg overflow-hidden flex flex-col";
        
        div.innerHTML = `
            <div class="p-3 md:p-4 bg-gray-800/50 flex justify-between items-start border-b border-gray-700">
                <div>
                    <span class="text-gray-400 text-xs font-mono bg-black px-1.5 py-0.5 rounded border border-gray-700">#${racer.number}</span>
                    <div class="font-bold text-lg text-white mt-1">${racer.name}</div>
                </div>
                <div class="text-right">
                        <div class="text-[var(--neon-green)] font-mono text-sm font-bold">${formatTime(best)}</div>
                        <div class="text-xs text-gray-500 uppercase">Fastest Lap</div>
                </div>
            </div>
            
            <div class="p-3 md:p-4 grid grid-cols-2 gap-4 text-xs font-mono border-b border-gray-700 bg-black/20">
                <div>
                    <div class="text-gray-500">Laps</div>
                    <div class="text-white text-lg">${laps.length} <span class="text-gray-600">/ ${raceConfig.totalLaps || '-'}</span></div>
                </div>
                <div class="text-right">
                    <div class="text-gray-500">Track Time</div>
                    <div class="text-white text-lg">${formatTime(totalTime)}</div>
                </div>
            </div>

            <div class="p-3 md:p-4 bg-gray-900/30">
                <div class="flex gap-2 items-end mb-3">
                    <div class="flex-grow">
                        <label class="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Log New Lap (Sec)</label>
                        <input type="number" step="0.001" id="time-${racer.id}" placeholder="82.1" 
                            class="w-full bg-black border border-gray-600 rounded p-2 text-white text-sm font-mono focus:border-[var(--neon-green)] outline-none">
                    </div>
                    <button onclick="window.addLap('${racer.id}')" class="bg-gray-700 hover:bg-[var(--neon-green)] hover:text-black text-white px-4 py-2 rounded text-sm font-bold transition h-[38px] flex items-center">
                        <i class="fa-solid fa-plus"></i>
                    </button>
                </div>
                <button onclick="window.openDriverDetails('${racer.id}')" class="w-full bg-blue-900/20 hover:bg-blue-900/40 text-blue-400 border border-blue-900/50 py-2 rounded text-xs font-bold uppercase transition flex justify-center items-center gap-2">
                    <i class="fa-solid fa-pen-to-square"></i> Edit / Manage Laps
                </button>
            </div>
        `;
        els.adminRacerList.appendChild(div);
    });
}

// --- Driver Detail Logic ---
window.openDriverDetails = (racerId) => {
    currentEditingRacerId = racerId;
    renderDriverDetail(racerId);
    els.manageView.classList.add('hidden');
    els.driverDetailView.classList.remove('hidden');
    window.scrollTo(0,0);
};

window.closeDriverDetails = () => {
    currentEditingRacerId = null;
    els.driverDetailView.classList.add('hidden');
    els.manageView.classList.remove('hidden');
};

function renderDriverDetail(racerId) {
    const racer = racersData.find(r => r.id === racerId);
    if (!racer) { window.closeDriverDetails(); return; }

    els.editId.value = racer.id;
    els.editName.value = racer.name;
    els.editNumber.value = racer.number;
    els.detailTotalLaps.innerText = `${racer.laps ? racer.laps.length : 0} Total Laps`;

    els.detailLapList.innerHTML = '';
    const laps = racer.laps || [];
    
    if (laps.length === 0) {
        els.detailLapList.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-gray-600 text-sm">No laps recorded yet.</td></tr>';
    } else {
        laps.map((time, index) => ({ time, index })).reverse().forEach(item => {
            const isBest = item.time === racer.bestLap;
            const tr = document.createElement('tr');
            tr.className = "hover:bg-white/5 border-b border-gray-800 last:border-0";
            tr.innerHTML = `
                <td class="p-3 text-gray-500 font-mono text-xs md:text-sm">${item.index + 1}</td>
                <td class="p-3 font-mono ${isBest ? 'text-[var(--neon-green)] font-bold' : 'text-gray-300'} text-xs md:text-sm">
                    ${formatTime(item.time)} ${isBest ? '<i class="fa-solid fa-star text-[10px] ml-1"></i>' : ''}
                </td>
                <td class="p-3 text-right">
                    <button onclick="window.deleteLap('${racerId}', ${item.index})" class="text-red-500 hover:text-white bg-red-900/20 hover:bg-red-600 p-1.5 rounded transition text-xs">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            `;
            els.detailLapList.appendChild(tr);
        });
    }
}

document.getElementById('editDriverForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentEditingRacerId) return;

    const newName = els.editName.value;
    const newNum = els.editNumber.value;
    const btn = e.target.querySelector('button[type="submit"]');

    toggleButtonLoading(btn, true);

    try {
        const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'racers', currentEditingRacerId);
        await updateDoc(ref, { name: newName, number: newNum });
        showToast("Updated", "Driver details saved");
    } catch (err) { 
        console.error(err); 
        showToast("Error", "Save failed", true); 
    } finally {
        toggleButtonLoading(btn, false);
    }
});

window.deleteCurrentDriver = async () => {
    if (!currentEditingRacerId || !confirm("Permanently delete this driver and all history?")) return;
    try {
        await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'racers', currentEditingRacerId));
        showToast("Deleted", "Driver removed");
        window.closeDriverDetails();
    } catch (err) { showToast("Error", "Delete failed", true); }
};

window.deleteLap = async (racerId, lapIndex) => {
    if (!confirm(`Delete Lap ${lapIndex + 1}?`)) return;

    try {
        const racerRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'racers', racerId);
        await runTransaction(db, async (transaction) => {
            const racerDoc = await transaction.get(racerRef);
            if (!racerDoc.exists()) throw "Racer does not exist!";

            const data = racerDoc.data();
            const laps = [...data.laps];

            if (lapIndex >= 0 && lapIndex < laps.length) {
                laps.splice(lapIndex, 1);
                const newBest = laps.length > 0 ? Math.min(...laps) : null;
                const lastLap = laps.length > 0 ? laps[laps.length - 1] : null;

                transaction.update(racerRef, { laps: laps, bestLap: newBest, lastLap: lastLap });
            } else {
                 throw "Invalid lap index";
            }
        });
        showToast("Lap Deleted", "Stats recalculated");
    } catch (err) { console.error(err); showToast("Error", "Could not delete lap", true); }
};

// --- Actions (with Lap Check) ---
document.getElementById('raceConfigForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    const btn = e.target.querySelector('button[type="submit"]');
    toggleButtonLoading(btn, true);
    const name = els.configName.value;
    const laps = parseInt(els.configLaps.value);
    try {
        await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'config', 'main'), { name, totalLaps: laps }, { merge: true });
        showToast("Success", "Race settings updated");
    } catch (err) { showToast("Error", "Failed to update settings", true); } finally { toggleButtonLoading(btn, false); }
});

document.getElementById('addRacerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    const name = document.getElementById('racerName').value;
    const number = document.getElementById('carNumber').value;
    const btn = e.target.querySelector('button[type="submit"]');
    if(!name || !number) return;
    toggleButtonLoading(btn, true);
    try {
        await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'racers'), {
            name, number, bestLap: null, laps: [], status: 'racing', createdAt: Date.now()
        });
        document.getElementById('addRacerForm').reset();
        showToast("Success", `Driver ${name} added`);
    } catch (err) { showToast("Error", "Could not add driver", true); } finally { toggleButtonLoading(btn, false); }
});

window.addLap = async (id) => {
    if (!isAdmin) return;
    const input = document.getElementById(`time-${id}`);
    const btn = input.parentElement.nextElementSibling; 
    const seconds = parseFloat(input.value);
    if (isNaN(seconds) || seconds <= 0) { showToast("Invalid Time", "Please enter valid seconds", true); return; }
    toggleButtonLoading(btn, true);
    const ms = Math.floor(seconds * 1000);
    const racerRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'racers', id);
    try {
        await runTransaction(db, async (transaction) => {
            const racerDoc = await transaction.get(racerRef);
            if (!racerDoc.exists()) throw "Racer does not exist!";
            
            const data = racerDoc.data();
            
            // CHECK: Prevent more laps than configured
            if (raceConfig.totalLaps > 0 && (data.laps || []).length >= raceConfig.totalLaps) {
                throw `Race limit (${raceConfig.totalLaps} laps) reached!`;
            }

            const newLaps = [...(data.laps || []), ms];
            const newBest = Math.min(...newLaps);
            transaction.update(racerRef, { laps: newLaps, bestLap: newBest, lastLap: ms });
        });
        input.value = '';
        showToast("Lap Logged", `#${id} - ${formatTime(ms)}`);
    } catch (err) { 
        console.error(err); 
        // Show specific error if it's our race limit error
        showToast("Error", typeof err === 'string' ? err : "Update failed", true); 
    } finally { 
        toggleButtonLoading(btn, false); 
    }
};

window.archiveRace = async () => {
    if(!isAdmin) return;
    if(!confirm("⚠️ End Current Race?\n\nThis will:\n1. Save results to History\n2. DELETE all current drivers\n3. Reset the track")) return;
    try {
        const podium = racersData.slice(0, 3).map(r => ({ 
            name: r.name, 
            number: r.number, 
            best: r.bestLap,
            laps: r.laps ? r.laps.length : 0,
            totalTime: calculateTotalTime(r.laps)
        }));
        const historyData = {
            raceName: raceConfig.name,
            totalLaps: raceConfig.totalLaps,
            totalDrivers: racersData.length,
            date: Date.now(),
            podium: podium
        };
        await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'history'), historyData);
        const batch = writeBatch(db);
        racersData.forEach(r => {
            const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'racers', r.id);
            batch.delete(ref);
        });
        await batch.commit();
        showToast("Race Archived", "Track is now clear");
    } catch(e) { console.error(e); showToast("Error", "Archive failed", true); }
};

window.switchView = (view) => {
    if (currentEditingRacerId) window.closeDriverDetails();
    if (view === 'manage') {
        els.liveView.classList.add('hidden');
        els.historyView.classList.add('hidden');
        els.manageView.classList.remove('hidden');
        if(raceConfig) {
            els.configName.value = raceConfig.name || "";
            els.configLaps.value = raceConfig.totalLaps || "";
        }
        renderAdminList();
    } else {
        els.manageView.classList.add('hidden');
        switchPublicView('live'); 
    }
};

window.switchPublicView = (view) => {
    els.manageView.classList.add('hidden');
    if (view === 'history') {
        els.liveView.classList.add('hidden');
        els.historyView.classList.remove('hidden');
        els.tabLive.className = "flex-1 md:flex-none px-6 py-2 rounded-md text-sm font-bold text-gray-400 hover:text-white transition";
        els.tabHistory.className = "flex-1 md:flex-none px-6 py-2 rounded-md text-sm font-bold bg-[var(--neon-green)] text-black shadow-lg transition";
    } else {
        els.historyView.classList.add('hidden');
        els.liveView.classList.remove('hidden');
        els.tabHistory.className = "flex-1 md:flex-none px-6 py-2 rounded-md text-sm font-bold text-gray-400 hover:text-white transition";
        els.tabLive.className = "flex-1 md:flex-none px-6 py-2 rounded-md text-sm font-bold bg-[var(--neon-green)] text-black shadow-lg transition";
    }
};

window.closeModal = () => {
    els.loginModal.classList.add('hidden');
    document.getElementById('pinInput').value = '';
};

document.getElementById('authBtn').addEventListener('click', () => {
    if (isAdmin) {
        isAdmin = false;
        els.adminControls.classList.add('hidden');
        document.getElementById('authBtn').innerHTML = `<i class="fa-solid fa-lock mr-2"></i>Admin`;
        switchView('live');
        showToast("Logged Out", "Admin mode disabled");
    } else {
        els.loginModal.classList.remove('hidden');
        document.getElementById('pinInput').focus();
    }
});

document.getElementById('pinForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pinInput = document.getElementById('pinInput');
    const pin = pinInput.value;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    toggleButtonLoading(submitBtn, true);
    try {
        const configRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'config', 'admin');
        const snap = await getDoc(configRef);
        let validPin = "1234";
        if (snap.exists() && snap.data().pin) validPin = snap.data().pin;
        if (pin === validPin) { 
            isAdmin = true;
            els.adminControls.classList.remove('hidden');
            document.getElementById('authBtn').innerHTML = `<i class="fa-solid fa-unlock mr-2"></i>Exit`;
            closeModal();
            showToast("Access Granted", "Welcome to Race Control");
            renderAdminList();
        } else {
            showToast("Access Denied", "Incorrect PIN", true);
            pinInput.value = '';
        }
    } catch (error) {
        console.error("PIN Check Error", error);
        if (pin === "1234") {
             showToast("Warning", "Using offline fallback PIN", true);
             isAdmin = true;
             els.adminControls.classList.remove('hidden');
             document.getElementById('authBtn').innerHTML = `<i class="fa-solid fa-unlock mr-2"></i>Exit`;
             closeModal();
             renderAdminList();
        }
    } finally { toggleButtonLoading(submitBtn, false); }
});

function showToast(title, msg, isError = false) {
    const t = els.toast;
    document.getElementById('toastTitle').innerText = title;
    document.getElementById('toastMsg').innerText = msg;
    t.className = `fixed bottom-6 right-6 left-6 md:left-auto px-6 py-4 rounded-r-lg border-l-4 shadow-2xl transform transition-all duration-300 z-50 flex items-center gap-3 md:max-w-xs ${isError ? 'bg-gray-800 text-white border-red-500' : 'bg-gray-800 text-white border-[var(--neon-green)]'}`;
    document.getElementById('toastIcon').innerHTML = isError ? '<i class="fa-solid fa-circle-xmark text-red-500"></i>' : '<i class="fa-solid fa-check-circle text-[var(--neon-green)]"></i>';
    t.classList.remove('translate-y-full');
    t.classList.remove('md:translate-x-full');
    setTimeout(() => {
        t.classList.add('translate-y-full');
        t.classList.add('md:translate-x-full');
    }, 3000);
}

init();