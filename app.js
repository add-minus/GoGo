/**
 * GoGo - Poker Chip Exchange (Real-time Firebase Version)
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- STEP 1: PASTE YOUR FIREBASE CONFIG HERE ---
// Get this from: Firebase Console > Project Settings > General > Your Apps > Config
const firebaseConfig = {
    apiKey: "AIzaSyCTZZFffcGToOw_zZ-DISC-vFo_SZgmL3s",
    authDomain: "gogo-poker.firebaseapp.com",
    projectId: "gogo-poker",
    storageBucket: "gogo-poker.firebasestorage.app",
    messagingSenderId: "355975442030",
    appId: "1:355975442030:web:c68f171be218faf548007f"
};

// Initialize Firebase
let app, db;
try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
} catch (e) {
    console.error("Firebase init failed. Check your config!", e);
}

// Global Error Handler for debugging
window.addEventListener("error", function (e) {
    const errEl = document.createElement('div');
    errEl.style.position = 'fixed';
    errEl.style.top = '10px';
    errEl.style.left = '10px';
    errEl.style.background = 'red';
    errEl.style.color = 'white';
    errEl.style.padding = '10px';
    errEl.style.zIndex = '9999';
    errEl.innerText = 'JS Error: ' + e.message;
    document.body.appendChild(errEl);
});

const CHIP_TYPES = {
    black: { val: 10, count: 200, color: 'black' },
    green: { val: 20, count: 100, color: 'green' },
    blue: { val: 50, count: 100, color: 'blue' },
    red: { val: 100, count: 100, color: 'red' },
    white: { val: 1000, count: 100, color: 'white' }
};

// --- State Management ---
let roomData = null;
let currentRoomId = null;
let currentPlayerId = null;
let isOwner = false;
let playerCart = { black: 0, green: 0, blue: 0, red: 0, white: 0 };
const PREDEFINED_NAMES = ['Add', 'Max', 'Tle'];
let pendingIsOwner = false;

// --- UI Components ---
const views = {
    entry: document.getElementById('room-entry-view'),
    game: document.getElementById('game-view'),
    player: document.getElementById('player-view'),
    admin: document.getElementById('admin-view'),
    adminToggle: document.getElementById('admin-toggle-bar')
};

// --- Core Logic ---

async function createNewRoom() {
    const roomId = Math.floor(100000 + Math.random() * 900000).toString();
    currentRoomId = roomId;
    pendingIsOwner = true;

    try {
        const roomRef = doc(db, "games", roomId);
        const newRoom = {
            id: roomId,
            owner: null,
            pool: { black: 200, green: 100, blue: 100, red: 100, white: 100 },
            players: {},
            pendingTransactions: [],
            transactions: [],
            createdAt: Date.now()
        };
        
        // Use a timeout to prevent silent hanging if Firebase is not reachable
        await Promise.race([
            setDoc(roomRef, newRoom),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Firebase connection timed out. Database might not exist or rules are blocking it.")), 5000))
        ]);
        
        roomData = newRoom;

        showProfileSetup();
    } catch (e) {
        showError("Connection error. Could not create room.");
        console.error(e);
    }
}

async function joinExistingRoom() {
    const roomId = document.getElementById('input-room-id').value.trim().toUpperCase();

    if (!roomId || roomId.length !== 6) {
        showError("Please enter a valid 6-Digit Room Code.");
        return;
    }

    try {
        const roomRef = doc(db, "games", roomId);
        const roomSnap = await getDoc(roomRef);

        if (!roomSnap.exists()) {
            showError("Room not found. Please check the code.");
            return;
        }

        roomData = roomSnap.data();
        currentRoomId = roomId;
        pendingIsOwner = false;

        showProfileSetup();
    } catch (e) {
        showError("Connection error while joining room.");
        console.error(e);
    }
}

function showProfileSetup() {
    document.getElementById('room-selection-view').style.display = 'none';
    document.getElementById('entry-subtitle').textContent = "Select your player profile";
    document.getElementById('profile-setup-view').style.display = 'flex';

    const container = document.getElementById('predefined-names');
    container.innerHTML = '';

    PREDEFINED_NAMES.forEach(name => {
        const isTaken = !!roomData.players[name];

        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.textContent = name;
        btn.style.flex = '1';
        btn.style.minWidth = '80px';

        if (isTaken) {
            btn.className = 'btn text-muted';
            btn.style.background = 'rgba(255,255,255,0.05)';
            btn.style.border = '1px solid rgba(255,255,255,0.1)';
            btn.style.pointerEvents = 'none';
            btn.style.opacity = '0.5';
        } else {
            btn.style.border = '1px solid var(--border)';
            btn.onclick = () => {
                document.getElementById('input-player-name').value = name;
                Array.from(container.children).forEach(c => c.style.borderColor = 'var(--border)');
                btn.style.borderColor = 'var(--accent)';
            };
        }

        container.appendChild(btn);
    });
}

async function enterGame() {
    const playerName = document.getElementById('input-player-name').value.trim();
    if (!playerName) {
        showError("Please select or type a name.");
        return;
    }

    try {
        const roomRef = doc(db, "games", currentRoomId);

        if (pendingIsOwner) {
            roomData.owner = playerName;
        }

        const existingPlayer = roomData.players[playerName];

        if (!existingPlayer) {
            roomData.players[playerName] = {
                name: playerName,
                inventory: { black: 0, green: 0, blue: 0, red: 0, white: 0 },
                history: []
            };
        }

        await updateDoc(roomRef, {
            players: roomData.players,
            ...(pendingIsOwner ? { owner: playerName } : {})
        });

        startSession(currentRoomId, playerName, pendingIsOwner || roomData.owner === playerName);
    } catch (e) {
        showError("Failed to enter the game.");
        console.error(e);
    }
}

function startSession(roomId, playerName, isRoomOwner) {
    currentRoomId = roomId;
    currentPlayerId = playerName;
    isOwner = isRoomOwner;

    // Switch to game view
    views.entry.style.display = 'none';
    views.game.style.display = 'flex';

    if (isOwner) {
        views.adminToggle.style.display = 'flex';
        switchMode('admin');
    } else {
        views.adminToggle.style.display = 'none';
        switchMode('player');
    }

    // Real-time listener
    onSnapshot(doc(db, "games", roomId), (doc) => {
        if (!doc.exists()) {
            alert("This room has been closed.");
            location.reload();
            return;
        }
        roomData = doc.data();
        updateUI();
    });
}

function switchMode(mode) {
    if (mode === 'admin') {
        views.admin.style.display = 'flex';
        views.player.style.display = 'none';
        document.getElementById('view-admin').style.opacity = '1';
        document.getElementById('view-player').style.opacity = '0.5';
    } else {
        views.player.style.display = 'flex';
        views.admin.style.display = 'none';
        document.getElementById('view-player').style.opacity = '1';
        document.getElementById('view-admin').style.opacity = '0.5';
    }
}

// --- UI Rendering ---

function updateUI() {
    if (!roomData) return;

    if (views.player.style.display === 'flex') renderPlayer();
    if (views.admin.style.display === 'flex') renderAdmin();

    // Sync Game Invite URL and trigger QR Code
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}`;
    const inviteEl = document.getElementById('invite-url');
    if (inviteEl) inviteEl.textContent = inviteUrl;

    const qrContainer = document.getElementById('qrcode');
    if (qrContainer && qrContainer.innerHTML === '') {
        new QRCode(qrContainer, { text: inviteUrl, width: 128, height: 128 });
    }

    lucide.createIcons();
}

function renderPlayer() {
    const player = roomData.players[currentPlayerId];
    if (!player) return;

    const balance = calculateBalance(player.inventory);
    document.getElementById('display-room-id').textContent = currentRoomId;
    document.getElementById('player-name-display').textContent = player.name;
    document.getElementById('player-balance').textContent = balance.toLocaleString();

    // Render Chip Selection
    const selectionEl = document.getElementById('player-chip-selection');
    selectionEl.innerHTML = Object.keys(CHIP_TYPES).map(key => `
        <div class="chip-row">
            <div class="chip-info">
                <div class="chip-circle bg-${key}"></div>
                <div class="chip-val">$${CHIP_TYPES[key].val}</div>
                <div class="text-muted" style="font-size: 0.7rem;">(Have: ${player.inventory[key]})</div>
            </div>
            <div class="chip-counter">
                <button class="counter-btn" onclick="window.updateCart('${key}', -1)">-</button>
                <span class="count-display">${playerCart[key]}</span>
                <button class="counter-btn" onclick="window.updateCart('${key}', 1)">+</button>
            </div>
        </div>
    `).join('');

    const cartVal = Object.keys(playerCart).reduce((sum, k) => sum + (playerCart[k] * CHIP_TYPES[k].val), 0);
    document.getElementById('player-cart-total').textContent = `$${cartVal.toLocaleString()}`;

    // Render History
    const historyEl = document.getElementById('player-history');
    const myPending = roomData.pendingTransactions.filter(t => t.playerName === currentPlayerId);

    if (myPending.length === 0 && player.history.length === 0) {
        historyEl.innerHTML = '<div class="text-muted" style="text-align: center; padding: 1rem;">No transactions yet.</div>';
    } else {
        const pendingHtml = myPending.map(t => `
            <div class="stack animate-in" style="padding: 1rem; border: 1px solid #eab308; background: rgba(234, 179, 8, 0.05); border-radius: 12px; gap: 4px;">
                <div class="row"><span class="badge badge-pending">PENDING</span> <button class="btn-xs btn-reject" onclick="window.cancelRequest('${t.id}')">Cancel</button></div>
                <div class="row"><b>${t.type === 'buy' ? 'Buy chips' : 'Return chips'}</b> <b>$${t.totalVal}</b></div>
                <div class="text-muted" style="font-size: 0.7rem;">${t.details}</div>
            </div>
        `).join('');

        const historyHtml = [...player.history].reverse().slice(0, 5).map(h => `
            <div class="stack" style="padding: 0.5rem 0; border-bottom: 1px solid var(--border); gap: 2px;">
                <div class="row">
                    <span>${h.type === 'buy' ? 'Exchange (Buy)' : 'Returned'}</span>
                    <span style="font-weight: 700; color: ${h.status === 'approved' ? 'var(--accent)' : 'var(--accent-alt)'}">${h.type === 'buy' ? '+' : '-'}$${h.totalVal}</span>
                </div>
                <div class="row" style="font-size: 0.7rem;">
                    <span class="text-muted">${h.details}</span>
                    <span class="badge badge-${h.status}">${h.status}</span>
                </div>
            </div>
        `).join('');
        historyEl.innerHTML = pendingHtml + historyHtml;
    }
}

function renderAdmin() {
    // Pending Approvals
    const pendingEl = document.getElementById('admin-pending-list');
    const pendingBadge = document.getElementById('pending-count-badge');
    pendingBadge.textContent = roomData.pendingTransactions.length;

    if (roomData.pendingTransactions.length === 0) {
        pendingEl.innerHTML = '<div class="text-muted" style="text-align: center; padding: 1rem;">No pending approvals</div>';
    } else {
        pendingEl.innerHTML = roomData.pendingTransactions.map(t => `
            <div class="request-card stack" style="gap: 8px;">
                <div class="row"><b>${t.playerName}</b> <span class="badge" style="background:rgba(255,255,255,0.05);">${t.type.toUpperCase()}</span></div>
                <div class="text-muted" style="font-size: 0.8rem;">${t.details} ($${t.totalVal})</div>
                <div class="row" style="margin-top: 4px;">
                    <button class="btn-xs btn-approve" onclick="window.resolveTx('${t.id}', true)">Approve</button>
                    <button class="btn-xs btn-reject" onclick="window.resolveTx('${t.id}', false)">Reject</button>
                </div>
            </div>
        `).join('');
    }

    // Reconciliation
    const totalBuy = Object.values(roomData.players).reduce((sum, p) => sum + p.history.filter(h => h.type === 'buy' && h.status === 'approved').reduce((s, h) => s + h.totalVal, 0), 0);
    const totalReturn = Object.values(roomData.players).reduce((sum, p) => sum + p.history.filter(h => h.type === 'sell' && h.status === 'approved').reduce((s, h) => s + h.totalVal, 0), 0);
    const net = totalBuy - totalReturn;

    document.getElementById('total-buy-in').textContent = totalBuy.toLocaleString();
    document.getElementById('total-cash-out').textContent = totalReturn.toLocaleString();

    const statusEl = document.getElementById('reconcile-status');
    const finishBtn = document.getElementById('btn-finish-game');

    if (net === 0 && totalBuy > 0) {
        statusEl.textContent = "BALANCED";
        statusEl.className = "badge badge-approved";
        finishBtn.disabled = false;
    } else {
        statusEl.textContent = net > 0 ? "UNBALANCED" : "EMPTY";
        statusEl.className = "badge badge-pending";
        finishBtn.disabled = true;
    }

    // Player List
    const listEl = document.getElementById('player-list');
    listEl.innerHTML = Object.values(roomData.players).map(p => {
        const bal = calculateBalance(p.inventory);
        return `
            <div class="row player-list-item">
                <div class="stack" style="gap: 2px;">
                    <b>${p.name}</b>
                    <span class="text-muted">$${bal.toLocaleString()}</span>
                </div>
                <div class="badge badge-approved">${bal > 0 ? 'ACTIVE' : 'IDLE'}</div>
            </div>
        `;
    }).join('');

    // Pool Grid
    document.getElementById('admin-pool-grid').innerHTML = Object.keys(CHIP_TYPES).map(k => `
        <div class="pool-item">
            <div class="pool-dot bg-${k}"></div>
            <div style="font-size: 0.7rem;">$${CHIP_TYPES[k].val}</div>
            <b style="font-size: 1.1rem;">${roomData.pool[k]}</b>
        </div>
    `).join('');

    const totalPool = Object.keys(CHIP_TYPES).reduce((sum, k) => sum + (roomData.pool[k] * CHIP_TYPES[k].val), 0);
    document.getElementById('admin-pool-value').textContent = totalPool.toLocaleString();
}

// --- Actions ---

window.updateCart = (key, delta) => {
    playerCart[key] = Math.max(0, playerCart[key] + delta);
    updateUI();
};

async function processTx(type) {
    const totalVal = Object.keys(playerCart).reduce((sum, k) => sum + (playerCart[k] * CHIP_TYPES[k].val), 0);
    if (totalVal === 0) return;

    // Validation
    const player = roomData.players[currentPlayerId];
    for (let k in playerCart) {
        if (type === 'buy' && roomData.pool[k] < playerCart[k]) return alert(`Pool empty for ${k}`);
        if (type === 'sell' && player.inventory[k] < playerCart[k]) return alert(`Insufficient ${k}`);
    }

    const tid = Date.now().toString();
    const details = Object.keys(playerCart).filter(k => playerCart[k] > 0).map(k => `${playerCart[k]}x ${k}`).join(', ');

    const newPending = [...roomData.pendingTransactions, {
        id: tid, playerName: currentPlayerId, type, totalVal, details, chips: { ...playerCart }, time: new Date().toLocaleTimeString()
    }];

    await updateDoc(doc(db, "games", currentRoomId), { pendingTransactions: newPending });
    playerCart = { black: 0, green: 0, blue: 0, red: 0, white: 0 };
    updateUI();
}

window.resolveTx = async (tid, approve) => {
    if (!isOwner) return;
    const tx = roomData.pendingTransactions.find(t => t.id === tid);
    if (!tx) return;

    const updatedRef = doc(db, "games", currentRoomId);
    const newPending = roomData.pendingTransactions.filter(t => t.id !== tid);
    const updatedPlayers = { ...roomData.players };
    const updatedPool = { ...roomData.pool };

    if (approve) {
        // Apply changes
        for (let k in tx.chips) {
            if (tx.type === 'buy') {
                updatedPool[k] -= tx.chips[k];
                updatedPlayers[tx.playerName].inventory[k] += tx.chips[k];
            } else {
                updatedPool[k] += tx.chips[k];
                updatedPlayers[tx.playerName].inventory[k] -= tx.chips[k];
            }
        }
        tx.status = 'approved';
    } else {
        tx.status = 'rejected';
    }

    updatedPlayers[tx.playerName].history.push(tx);
    await updateDoc(updatedRef, {
        pendingTransactions: newPending,
        players: updatedPlayers,
        pool: updatedPool,
        transactions: [tx, ...roomData.transactions]
    });
};

window.cancelRequest = async (tid) => {
    const newPending = roomData.pendingTransactions.filter(t => t.id !== tid);
    await updateDoc(doc(db, "games", currentRoomId), { pendingTransactions: newPending });
};

window.finishGame = async () => {
    if (!isOwner) return;
    if (confirm("End the game and clear all data? This cannot be undone.")) {
        await deleteDoc(doc(db, "games", currentRoomId));
        location.reload();
    }
};

function calculateBalance(inventory) {
    return Object.keys(CHIP_TYPES).reduce((sum, key) => sum + (inventory[key] * CHIP_TYPES[key].val), 0);
}

function showError(msg) {
    const el = document.getElementById('login-error');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 3000);
}

// --- Events ---
document.getElementById('btn-enter-game').addEventListener('click', enterGame);
document.getElementById('btn-create-room').addEventListener('click', createNewRoom);
document.getElementById('btn-join-room').addEventListener('click', joinExistingRoom);
document.getElementById('view-player').addEventListener('click', () => switchMode('player'));
document.getElementById('view-admin').addEventListener('click', () => switchMode('admin'));
document.getElementById('btn-execute-buy').addEventListener('click', () => processTx('buy'));
document.getElementById('btn-execute-sell').addEventListener('click', () => processTx('sell'));
document.getElementById('btn-finish-game').addEventListener('click', () => window.finishGame());

// Handle settings
document.getElementById('btn-settings').addEventListener('click', () => {
    const modal = document.getElementById('modal-backdrop');
    document.getElementById('modal-title').textContent = "Room Settings";
    document.getElementById('modal-body').innerHTML = `
        <label class="text-muted">Exchange Rate (1 THB : X Chips)</label>
        <input type="number" id="setting-rate" value="10">
    `;
    modal.style.display = 'flex';
});

document.getElementById('modal-ok').addEventListener('click', () => {
    document.getElementById('modal-backdrop').style.display = 'none';
});
document.getElementById('modal-cancel').addEventListener('click', () => {
    document.getElementById('modal-backdrop').style.display = 'none';
});
