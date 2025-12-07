/* filename: app.js */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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
// Note: We access these inside functions to ensure DOM is ready, or rely on defer/module execution
const els = {
    loginModal: document.getElementById('loginModal'),
    adminControls: document.getElementById('adminControls'),
    liveView: document.getElementById('liveView'),
    manageView: document.getElementById('manageView'),
    driverDetailView: document.getElementById('driverDetailView'),
    leaderboardBody: document.getElementById('leaderboardBody'),
    podiumContainer: document.getElementById('podiumContainer'),
    adminRacerList: document.getElementById('adminRacerList'),
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
    detailTotalLaps: document.getElementById('detailTotalLaps')
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
    const configRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'config', 'main');
    onSnapshot(configRef, (doc) => {
        if (doc.exists()) {
            raceConfig = doc.data();
            updateRaceHeader();
            if(isAdmin) {
                els.configName.value = raceConfig.name || "";
                els.configLaps.value = raceConfig.totalLaps || "";
            }
        }
    });

    const racersRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'racers');
    onSnapshot(racersRef, (snapshot) => {
        const racers = [];
        snapshot.forEach(doc => racers.push({ id: doc.id, ...doc.data() }));
        
        racersData = racers.sort((a, b) => {
            if (!a.bestLap) return 1;
            if (!b.bestLap) return -1;
            return a.bestLap - b.bestLap;
        });

        renderLiveView();
        renderAdminList();
        
        // If currently editing a racer, refresh their detail view too
        if (currentEditingRacerId) {
            renderDriverDetail(currentEditingRacerId);
        }
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

// --- Rendering ---
function updateRaceHeader() {
    els.raceName.innerText = raceConfig.name || "Grand Prix";
    els.raceStats.innerText = `${raceConfig.totalLaps ? raceConfig.totalLaps + ' LAPS' : 'PRACTICE SESSION'} • ${racersData.length} DRIVERS`;
}

function renderLiveView() {
    els.leaderboardBody.innerHTML = '';
    const bestTime = racersData[0]?.bestLap || 0;

    if(racersData.length === 0) {
            els.leaderboardBody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-gray-500 font-mono">WAITING FOR ENTRIES</td></tr>`;
    }

    racersData.forEach((racer, index) => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-white/5 transition group";
        
        let gap = `<span class="text-gray-600">-</span>`;
        if (index > 0 && racer.bestLap && bestTime) {
            gap = `<span class="text-[var(--neon-red)] font-mono text-xs">+${((racer.bestLap - bestTime) / 1000).toFixed(2)}s</span>`;
        }

        let rank = `<span class="font-mono text-gray-500">P${index + 1}</span>`;
        if (index === 0 && racer.bestLap) rank = `<span class="bg-[var(--neon-green)] text-black font-bold px-2 rounded text-xs">P1</span>`;
        
        const lapCount = racer.laps ? racer.laps.length : 0;
        const maxLaps = raceConfig.totalLaps || 0;
        const lapDisplay = maxLaps > 0 ? `${lapCount}<span class="text-gray-600">/${maxLaps}</span>` : lapCount;

        tr.innerHTML = `
            <td class="p-4 text-center">${rank}</td>
            <td class="p-4 font-mono text-gray-400 group-hover:text-white transition">#${racer.number}</td>
            <td class="p-4 font-bold text-gray-200 group-hover:text-white">${racer.name}</td>
            <td class="p-4 text-center font-mono text-gray-400 text-xs">${lapDisplay}</td>
            <td class="p-4 text-right font-mono text-[var(--neon-blue)]">${formatTime(racer.bestLap)}</td>
            <td class="p-4 text-right">${gap}</td>
        `;
        els.leaderboardBody.appendChild(tr);
    });

    els.podiumContainer.innerHTML = '';
    const winners = racersData.filter(r => r.bestLap).slice(0, 3);
    
    if (winners.length === 0) {
            els.podiumContainer.innerHTML = `<div class="text-gray-600 font-mono text-sm">NO DATA AVAILABLE</div>`;
            return;
    }

    const visualOrder = [1, 0, 2];
    visualOrder.forEach(placeIndex => {
        if (winners[placeIndex]) {
            const racer = winners[placeIndex];
            const realRank = placeIndex + 1;
            
            let styles = {
                1: { h: 'h-40 md:h-56', bg: 'bg-[var(--neon-green)]', order: 'order-2', scale: 'scale-110 z-10', text: 'text-black' },
                2: { h: 'h-24 md:h-40', bg: 'bg-gray-300', order: 'order-1', scale: 'scale-100 mt-8', text: 'text-black' },
                3: { h: 'h-20 md:h-32', bg: 'bg-orange-600', order: 'order-3', scale: 'scale-95 mt-12', text: 'text-white' }
            }[realRank];

            const bar = document.createElement('div');
            bar.className = `${styles.order} flex flex-col items-center justify-end w-1/3 max-w-[120px] podium-bar ${styles.scale}`;
            
            bar.innerHTML = `
                <div class="mb-3 text-center w-full">
                    <div class="text-[10px] text-gray-400 font-mono mb-1">#${racer.number}</div>
                    <div class="font-bold truncate w-full px-1 text-xs md:text-sm text-gray-200">${racer.name}</div>
                    <div class="font-mono text-[10px] text-[var(--neon-green)]">${formatTime(racer.bestLap)}</div>
                </div>
                <div class="w-full ${styles.h} ${styles.bg} rounded-t-lg shadow-[0_0_20px_rgba(0,0,0,0.5)] relative flex items-start justify-center pt-2 border-x border-t border-white/20">
                    <span class="${styles.text} font-black text-2xl opacity-40">${realRank}</span>
                </div>
            `;
            els.podiumContainer.appendChild(bar);
        }
    });

    document.getElementById('lastUpdated').innerText = `UPDATED: ${new Date().toLocaleTimeString()}`;
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
            <div class="p-4 bg-gray-800/50 flex justify-between items-start border-b border-gray-700">
                <div>
                    <span class="text-gray-400 text-xs font-mono bg-black px-1.5 py-0.5 rounded border border-gray-700">#${racer.number}</span>
                    <div class="font-bold text-lg text-white mt-1">${racer.name}</div>
                </div>
                <div class="text-right">
                        <div class="text-[var(--neon-green)] font-mono text-sm font-bold">${formatTime(best)}</div>
                        <div class="text-xs text-gray-500 uppercase">Fastest Lap</div>
                </div>
            </div>
            
            <div class="p-4 grid grid-cols-2 gap-4 text-xs font-mono border-b border-gray-700 bg-black/20">
                <div>
                    <div class="text-gray-500">Laps Completed</div>
                    <div class="text-white text-lg">${laps.length} <span class="text-gray-600">/ ${raceConfig.totalLaps || '-'}</span></div>
                </div>
                <div class="text-right">
                    <div class="text-gray-500">Total Track Time</div>
                    <div class="text-white text-lg">${formatTime(totalTime)}</div>
                </div>
            </div>

            <div class="p-4 bg-gray-900/30">
                <div class="flex gap-2 items-end mb-3">
                    <div class="flex-grow">
                        <label class="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Log New Lap (Sec)</label>
                        <input type="number" step="0.001" id="time-${racer.id}" placeholder="e.g. 82.15" 
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
    
    // Switch Views
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

    // Populate Edit Form
    els.editId.value = racer.id;
    els.editName.value = racer.name;
    els.editNumber.value = racer.number;
    els.detailTotalLaps.innerText = `${racer.laps ? racer.laps.length : 0} Total Laps`;

    // Populate Lap Table
    els.detailLapList.innerHTML = '';
    const laps = racer.laps || [];
    
    if (laps.length === 0) {
        els.detailLapList.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-gray-600 text-sm">No laps recorded yet.</td></tr>';
    } else {
        // Reverse to show latest first, but keep track of original index
        laps.map((time, index) => ({ time, index })).reverse().forEach(item => {
            const isBest = item.time === racer.bestLap;
            const tr = document.createElement('tr');
            tr.className = "hover:bg-white/5 border-b border-gray-800 last:border-0";
            tr.innerHTML = `
                <td class="p-3 text-gray-500 font-mono text-sm">${item.index + 1}</td>
                <td class="p-3 font-mono ${isBest ? 'text-[var(--neon-green)] font-bold' : 'text-gray-300'}">
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

    try {
        const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'racers', currentEditingRacerId);
        await updateDoc(ref, { name: newName, number: newNum });
        showToast("Updated", "Driver details saved");
    } catch (err) { console.error(err); showToast("Error", "Save failed", true); }
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
        const racerSnap = await getDoc(racerRef);
        
        if (racerSnap.exists()) {
            const data = racerSnap.data();
            const laps = [...data.laps];
            
            // Remove the specific lap
            if (lapIndex >= 0 && lapIndex < laps.length) {
                laps.splice(lapIndex, 1);
                
                // Recalculate Stats
                const newBest = laps.length > 0 ? Math.min(...laps) : null;
                const lastLap = laps.length > 0 ? laps[laps.length - 1] : null;

                await updateDoc(racerRef, {
                    laps: laps,
                    bestLap: newBest,
                    lastLap: lastLap
                });
                showToast("Lap Deleted", "Stats recalculated");
            }
        }
    } catch (err) {
        console.error(err);
        showToast("Error", "Could not delete lap", true);
    }
};


// --- Existing Admin Actions ---

document.getElementById('raceConfigForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    const name = els.configName.value;
    const laps = parseInt(els.configLaps.value);
    try {
        await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'config', 'main'), { name, totalLaps: laps }, { merge: true });
        showToast("Success", "Race settings updated");
    } catch (err) { showToast("Error", "Failed to update settings", true); }
});

document.getElementById('addRacerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    const name = document.getElementById('racerName').value;
    const number = document.getElementById('carNumber').value;
    if(!name || !number) return;
    try {
        await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'racers'), {
            name, number, bestLap: null, laps: [], status: 'racing', createdAt: Date.now()
        });
        document.getElementById('addRacerForm').reset();
        showToast("Success", `Driver ${name} added`);
    } catch (err) { showToast("Error", "Could not add driver", true); }
});

window.addLap = async (id) => {
    if (!isAdmin) return;
    const input = document.getElementById(`time-${id}`);
    const seconds = parseFloat(input.value);
    if (isNaN(seconds) || seconds <= 0) { showToast("Invalid Time", "Please enter valid seconds", true); return; }
    const ms = Math.floor(seconds * 1000);
    try {
        const racerRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'racers', id);
        const racerSnap = await getDoc(racerRef);
        if (racerSnap.exists()) {
            const data = racerSnap.data();
            const newLaps = [...(data.laps || []), ms];
            const newBest = Math.min(...newLaps);
            await updateDoc(racerRef, { laps: newLaps, bestLap: newBest, lastLap: ms });
            input.value = '';
            showToast("Lap Logged", `#${data.number} - ${formatTime(ms)}`);
        }
    } catch (err) { showToast("Error", "Update failed", true); }
};

// --- UI Utils ---
window.switchView = (view) => {
    // Reset Detail View if leaving
    if (currentEditingRacerId) window.closeDriverDetails();

    if (view === 'manage') {
        els.liveView.classList.add('hidden');
        els.manageView.classList.remove('hidden');
        if(raceConfig) {
            els.configName.value = raceConfig.name || "";
            els.configLaps.value = raceConfig.totalLaps || "";
        }
        renderAdminList();
    } else {
        els.manageView.classList.add('hidden');
        els.liveView.classList.remove('hidden');
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

document.getElementById('pinForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const pin = document.getElementById('pinInput').value;
    if (pin === "1234") { 
        isAdmin = true;
        els.adminControls.classList.remove('hidden');
        document.getElementById('authBtn').innerHTML = `<i class="fa-solid fa-unlock mr-2"></i>Exit`;
        closeModal();
        showToast("Access Granted", "Welcome to Race Control");
        renderAdminList();
    } else {
        showToast("Access Denied", "Incorrect PIN", true);
        document.getElementById('pinInput').value = '';
    }
});

function showToast(title, msg, isError = false) {
    const t = els.toast;
    document.getElementById('toastTitle').innerText = title;
    document.getElementById('toastMsg').innerText = msg;
    t.className = `fixed bottom-6 right-6 px-6 py-4 rounded-r-lg border-l-4 shadow-2xl transform transition-all duration-300 z-50 flex items-center gap-3 max-w-xs ${isError ? 'bg-gray-800 text-white border-red-500' : 'bg-gray-800 text-white border-[var(--neon-green)]'}`;
    document.getElementById('toastIcon').innerHTML = isError ? '<i class="fa-solid fa-circle-xmark text-red-500"></i>' : '<i class="fa-solid fa-check-circle text-[var(--neon-green)]"></i>';
    t.classList.remove('translate-x-full');
    setTimeout(() => t.classList.add('translate-x-full'), 3000);
}

init();