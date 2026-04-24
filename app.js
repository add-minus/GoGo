/**
 * GoGo - Poker Chip Exchange (Real-time Firebase Version)
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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
let app, db, auth;
try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    
    // Auth State Observer
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            await checkUserProfile();
        } else {
            currentUser = null;
            showLogin();
        }
    });
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
let currentUser = null; // Google Auth User
let currentPlayerId = null; // UID
let isOwner = false;
let playerCart = { black: 0, green: 0, blue: 0, red: 0, white: 0 };
let pendingIsOwner = false;

// --- UI Components ---
const views = {
    entry: document.getElementById('room-entry-view'),
    login: document.getElementById('view-login'),
    profileSetup: document.getElementById('view-profile-setup'),
    roomSelection: document.getElementById('view-room-selection'),
    game: document.getElementById('game-view'),
    player: document.getElementById('player-view'),
    roomStatus: document.getElementById('room-view'),
    admin: document.getElementById('admin-view'),
    adminToggle: document.getElementById('admin-toggle-bar')
};

// --- Core Logic ---

async function createNewRoom() {
    if (!currentUser) return showLogin();
    const roomId = Math.floor(100000 + Math.random() * 900000).toString();
    currentRoomId = roomId;
    pendingIsOwner = true;

    try {
        const roomRef = doc(db, "games", roomId);
        const newRoom = {
            id: roomId,
            ownerId: currentUser.uid,
            pool: { black: 200, green: 100, blue: 100, red: 100, white: 100 },
            players: {},
            pendingTransactions: [],
            transactions: [],
            createdAt: Date.now()
        };
        
        await Promise.race([
            setDoc(roomRef, newRoom),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Firebase connection timed out.")), 5000))
        ]);
        
        roomData = newRoom;
        await enterGame();
    } catch (e) {
        showError("Connection error. Could not create room.");
        console.error(e);
    }
}

async function joinExistingRoom(overrideRoomId) {
    if (!currentUser) return showLogin();
    const roomId = overrideRoomId || document.getElementById('input-room-id').value.trim().toUpperCase();

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

        await enterGame();
    } catch (e) {
        showError("Connection error while joining room.");
        console.error(e);
    }
}


async function loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
        // onAuthStateChanged will handle the rest
    } catch (e) {
        showError("Google Login Failed.");
        console.error(e);
    }
}

async function enterGame() {
    if (!currentUser) return;
    const uid = currentUser.uid;
    const name = currentUser.displayName || "Anonymous";

    try {
        const roomRef = doc(db, "games", currentRoomId);
        const existingPlayer = roomData.players[uid];

        if (!existingPlayer) {
            roomData.players[uid] = {
                name: currentUser.displayName || "Anonymous",
                photoURL: currentUser.photoURL,
                inventory: { black: 0, green: 0, blue: 0, red: 0, white: 0 },
                history: []
            };
        }

        const updateData = { players: roomData.players };
        if (pendingIsOwner) {
            updateData.ownerId = uid;
        }

        await updateDoc(roomRef, updateData);
        startSession(currentRoomId, uid, pendingIsOwner || roomData.ownerId === uid);
    } catch (e) {
        showError("Failed to enter the game.");
        console.error(e);
    }
}

function startSession(roomId, playerName, isRoomOwner) {
    currentRoomId = roomId;
    currentPlayerId = playerName;
    isOwner = isRoomOwner;
    
    // Update URL
    window.history.pushState({}, '', `?room=${roomId}`);

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
        
        // Sync ownership in real-time
        const wasOwner = isOwner;
        isOwner = roomData.ownerId === currentPlayerId;
        
        if (isOwner !== wasOwner) {
            views.adminToggle.style.display = isOwner ? 'flex' : 'none';
            if (!isOwner && views.admin.style.display === 'flex') {
                switchMode('player');
            }
        }
        
        updateUI();
    });
}

function switchMode(mode) {
    views.player.style.display = 'none';
    views.roomStatus.style.display = 'none';
    views.admin.style.display = 'none';
    
    // Reset button opacities
    ['view-player', 'view-room', 'view-admin'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.opacity = '0.5';
    });

    if (mode === 'admin') {
        views.admin.style.display = 'flex';
        document.getElementById('view-admin').style.opacity = '1';
    } else if (mode === 'room') {
        views.roomStatus.style.display = 'flex';
        document.getElementById('view-room').style.opacity = '1';
    } else {
        views.player.style.display = 'flex';
        document.getElementById('view-player').style.opacity = '1';
    }
    updateUI();
}

// --- Navigation & Auth Flow ---

async function checkUserProfile() {
    try {
        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            currentUser.displayName = userSnap.data().displayName;
            // Check for room param in URL
            const urlParams = new URLSearchParams(window.location.search);
            const roomFromUrl = urlParams.get('room');
            if (roomFromUrl) {
                document.getElementById('input-room-id').value = roomFromUrl;
                joinExistingRoom(roomFromUrl);
            } else {
                showRoomSelection();
            }
        } else {
            showProfileSetup();
        }
    } catch (e) {
        console.error("Profile check failed", e);
        showRoomSelection(); // Fallback
    }
}

async function saveProfile() {
    const name = document.getElementById('setup-display-name').value.trim();
    if (!name) return alert("Please enter a name");
    
    try {
        await setDoc(doc(db, "users", currentUser.uid), {
            displayName: name,
            photoURL: currentUser.photoURL,
            updatedAt: Date.now()
        });
        currentUser.displayName = name;
        checkUserProfile(); // Continue flow
    } catch (e) {
        showError("Failed to save profile.");
    }
}

function showLogin() {
    views.entry.style.display = 'flex';
    views.game.style.display = 'none';
    views.login.style.display = 'flex';
    views.profileSetup.style.display = 'none';
    views.roomSelection.style.display = 'none';
}

function showProfileSetup() {
    views.entry.style.display = 'flex';
    views.game.style.display = 'none';
    views.login.style.display = 'none';
    views.profileSetup.style.display = 'flex';
    views.roomSelection.style.display = 'none';
}

function showRoomSelection() {
    views.entry.style.display = 'flex';
    views.game.style.display = 'none';
    views.login.style.display = 'none';
    views.profileSetup.style.display = 'none';
    views.roomSelection.style.display = 'flex';
}

// --- UI Rendering ---

function updateUI() {
    if (!roomData) return;

    // Show/Hide Approvals tab based on admin status
    document.getElementById('view-admin').style.display = isOwner ? 'block' : 'none';
    document.getElementById('btn-finish-game').style.display = isOwner ? 'block' : 'none';
    views.adminToggle.style.display = 'flex';

    if (views.player.style.display === 'flex') renderPlayer();
    if (views.roomStatus.style.display === 'flex') renderAdmin();
    if (views.admin.style.display === 'flex') renderApprovals();

    // Sync Game Invite URL and trigger QR Code
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}`;
    const inviteEl = document.getElementById('invite-url');
    if (inviteEl) inviteEl.textContent = inviteUrl;

    const roomCodeEl = document.getElementById('admin-room-code-display');
    if (roomCodeEl) roomCodeEl.textContent = currentRoomId;

    const qrContainer = document.getElementById('qrcode');
    if (qrContainer && qrContainer.innerHTML === '') {
        new QRCode(qrContainer, { text: inviteUrl, width: 128, height: 128 });
    }

    lucide.createIcons();
}

function renderPlayer() {
    document.getElementById('display-room-id').textContent = currentRoomId;
    
    const player = roomData.players[currentPlayerId];
    if (!player) {
        document.getElementById('player-chip-selection').innerHTML = '<div class="text-muted" style="text-align: center; padding: 2rem;">Loading player data...</div>';
        return;
    }

    const myBuy = player.history.filter(h => h.type === 'buy' && h.status === 'approved').reduce((s, h) => s + h.totalVal, 0);
    const myReturn = player.history.filter(h => h.type === 'sell' && h.status === 'approved').reduce((s, h) => s + h.totalVal, 0);
    const net = myReturn - myBuy;

    document.getElementById('player-name-display').textContent = player.name;
    document.getElementById('player-total-buy').textContent = myBuy.toLocaleString();
    document.getElementById('player-total-return').textContent = myReturn.toLocaleString();
    
    const balEl = document.getElementById('player-balance');
    balEl.textContent = (net > 0 ? '+' : '') + net.toLocaleString();
    balEl.parentElement.style.color = net < 0 ? 'var(--accent-alt)' : (net > 0 ? 'var(--accent)' : 'var(--text-muted)');

    // Render Chip Selection
    const selectionEl = document.getElementById('player-chip-selection');
    selectionEl.innerHTML = Object.keys(CHIP_TYPES).map(key => `
        <div class="chip-row">
            <div class="chip-info">
                <div class="chip-circle bg-${key}"></div>
                <div class="chip-val">$${CHIP_TYPES[key].val}</div>
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
                <div class="row" style="gap: 4px; flex-wrap: wrap; margin-top: 4px; justify-content: flex-start;">
                    ${Object.entries(t.chips || {}).filter(([k, v]) => v > 0).map(([k, v]) => `
                        <div class="row" style="gap: 4px; background: rgba(255,255,255,0.05); padding: 2px 8px; border-radius: 6px; border: 1px solid var(--border);">
                            <div class="chip-circle bg-${k}" style="width: 12px; height: 12px;"></div>
                            <span style="font-size: 0.7rem; font-weight: 600;">$${CHIP_TYPES[k].val} x${v}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');

        const historyHtml = [...player.history].reverse().slice(0, 5).map(h => `
            <div class="stack" style="padding: 0.5rem 0; border-bottom: 1px solid var(--border); gap: 2px;">
                <div class="row">
                    <span>${h.type === 'buy' ? 'Exchange (Buy)' : 'Returned'}</span>
                    <span style="font-weight: 700; color: ${h.type === 'buy' ? 'var(--accent-alt)' : 'var(--accent)'}">${h.type === 'buy' ? '-' : '+'}$${h.totalVal}</span>
                </div>
                <div class="row" style="gap: 4px; flex-wrap: wrap; margin-top: 2px; justify-content: flex-start;">
                    ${Object.entries(h.chips || {}).filter(([k, v]) => v > 0).map(([k, v]) => `
                        <div class="row" style="gap: 4px; background: rgba(255,255,255,0.03); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.05);">
                            <div class="chip-circle bg-${k}" style="width: 10px; height: 10px;"></div>
                            <span style="font-size: 0.65rem;">$${CHIP_TYPES[k].val} x${v}</span>
                        </div>
                    `).join('')}
                    <span class="badge badge-${h.status}" style="margin-left: auto; font-size: 0.6rem;">${h.status}</span>
                </div>
            </div>
        `).join('');
        historyEl.innerHTML = pendingHtml + historyHtml;
    }
}

function renderApprovals() {
    const pendingEl = document.getElementById('admin-pending-list');
    const pendingBadge = document.getElementById('pending-count-badge');
    if (!pendingEl || !pendingBadge) return;
    
    pendingBadge.textContent = roomData.pendingTransactions.length;

    if (roomData.pendingTransactions.length === 0) {
        pendingEl.innerHTML = '<div class="text-muted" style="text-align: center; padding: 1rem;">No pending approvals</div>';
    } else {
        pendingEl.innerHTML = roomData.pendingTransactions.map(t => {
            const requester = roomData.players[t.playerName] || { name: 'Unknown' };
            return `
                <div class="request-card stack" style="gap: 8px;">
                    <div class="row" style="gap: 12px;">
                        <img src="${requester.photoURL || 'https://via.placeholder.com/24'}" style="width: 24px; height: 24px; border-radius: 50%;">
                        <b>${requester.name}</b> 
                        <span class="badge" style="background:rgba(255,255,255,0.05);">${t.type.toUpperCase()}</span>
                    </div>
                    <div class="row" style="gap: 4px; flex-wrap: wrap; justify-content: flex-start;">
                        ${Object.entries(t.chips || {}).filter(([k, v]) => v > 0).map(([k, v]) => `
                            <div class="row" style="gap: 4px; background: rgba(0,0,0,0.2); padding: 4px 8px; border-radius: 8px; border: 1px solid var(--border);">
                                <div class="chip-circle bg-${k}" style="width: 14px; height: 14px;"></div>
                                <span style="font-size: 0.8rem; font-weight: 700;">$${CHIP_TYPES[k].val} x${v}</span>
                            </div>
                        `).join('')}
                    </div>
                    <div class="row" style="margin-top: 4px;">
                        <div style="font-size: 1rem; font-weight: 700; color: ${t.type === 'buy' ? 'var(--accent-alt)' : 'var(--accent)'}">${t.type === 'buy' ? '-' : '+'}$${t.totalVal}</div>
                        <div class="row" style="gap: 8px;">
                            <button class="btn-xs btn-approve" onclick="window.resolveTx('${t.id}', true)">Approve</button>
                            <button class="btn-xs btn-reject" onclick="window.resolveTx('${t.id}', false)">Reject</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
}

function renderAdmin() {
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
    listEl.innerHTML = Object.entries(roomData.players).map(([uid, p]) => {
        const bal = calculateBalance(p.inventory);
        const isSelf = uid === currentPlayerId;
        const isTargetOwner = uid === roomData.ownerId;

        return `
            <div class="row player-list-item">
                <div class="row" style="gap: 12px; flex: 1;">
                    <img src="${p.photoURL || 'https://via.placeholder.com/32'}" style="width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--border);">
                    <div class="stack" style="gap: 2px;">
                        <b>${p.name} ${isSelf ? '(You)' : ''}</b>
                        <span class="text-muted">$${bal.toLocaleString()}</span>
                    </div>
                </div>
                <div class="row" style="gap: 8px;">
                    ${isTargetOwner ? '<span class="badge badge-approved" style="background: var(--primary); color: white;">OWNER</span>' : 
                      `<button class="btn-xs btn-reject" onclick="window.transferOwnership('${uid}')">Make Owner</button>`}
                    <div class="badge badge-approved">${bal > 0 ? 'ACTIVE' : 'IDLE'}</div>
                </div>
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

    // Game History
    const gameHistoryEl = document.getElementById('admin-game-history');
    if (roomData.transactions.length === 0) {
        gameHistoryEl.innerHTML = '<div class="text-muted" style="text-align: center; padding: 1rem;">No history yet</div>';
    } else {
        gameHistoryEl.innerHTML = roomData.transactions.map(h => {
            const p = roomData.players[h.playerName] || { name: 'Unknown' };
            return `
                <div class="stack" style="padding: 0.75rem; border-bottom: 1px solid var(--border); gap: 4px; background: rgba(255,255,255,0.02); border-radius: 8px;">
                    <div class="row">
                        <div class="row" style="gap: 8px;">
                            <img src="${p.photoURL || 'https://via.placeholder.com/20'}" style="width: 20px; height: 20px; border-radius: 50%;">
                            <span style="font-weight: 600;">${p.name}</span>
                        </div>
                        <span style="font-weight: 700; color: ${h.type === 'buy' ? 'var(--accent-alt)' : 'var(--accent)'}">${h.type === 'buy' ? '-' : '+'}$${h.totalVal}</span>
                    </div>
                    <div class="row" style="gap: 4px; flex-wrap: wrap; justify-content: flex-start;">
                        ${Object.entries(h.chips || {}).filter(([k, v]) => v > 0).map(([k, v]) => `
                            <div class="row" style="gap: 4px; padding: 2px 6px; border-radius: 4px;">
                                <div class="chip-circle bg-${k}" style="width: 10px; height: 10px;"></div>
                                <span style="font-size: 0.65rem;">$${CHIP_TYPES[k].val} x${v}</span>
                            </div>
                        `).join('')}
                        <span class="text-muted" style="margin-left: auto; font-size: 0.6rem;">${h.time}</span>
                    </div>
                </div>
            `;
        }).join('');
    }
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

window.transferOwnership = async (targetUid) => {
    if (!isOwner) return;
    const targetName = roomData.players[targetUid].name;
    const confirmed = await showConfirm("Transfer Ownership", `Are you sure you want to transfer room ownership to ${targetName}? You will lose admin access immediately.`);
    if (confirmed) {
        await updateDoc(doc(db, "games", currentRoomId), { ownerId: targetUid });
    }
};

window.finishGame = async () => {
    if (!isOwner) return;
    const confirmed = await showConfirm("Finish Game", "Are you sure you want to end the game and clear all data? This will disconnect all players and cannot be undone.");
    if (confirmed) {
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

function showConfirm(title, message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal-backdrop');
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').innerHTML = `<p style="padding: 1rem 0;">${message}</p>`;
        
        const okBtn = document.getElementById('modal-ok');
        const cancelBtn = document.getElementById('modal-cancel');
        
        const onOk = () => cleanup(true);
        const onCancel = () => cleanup(false);
        
        const cleanup = (val) => {
            modal.style.display = 'none';
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            resolve(val);
        };
        
        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        modal.style.display = 'flex';
    });
}

// --- Events ---
document.getElementById('btn-google-login').addEventListener('click', loginWithGoogle);
document.getElementById('btn-create-room').addEventListener('click', createNewRoom);
document.getElementById('btn-join-room').addEventListener('click', () => {
    const rid = document.getElementById('input-room-id').value.trim();
    if (rid.length === 6) joinExistingRoom(rid);
});
document.getElementById('view-player').addEventListener('click', () => switchMode('player'));
document.getElementById('view-room').addEventListener('click', () => switchMode('room'));
document.getElementById('view-admin').addEventListener('click', () => switchMode('admin'));
document.getElementById('btn-save-profile').addEventListener('click', saveProfile);
document.getElementById('btn-execute-buy').addEventListener('click', () => processTx('buy'));
document.getElementById('btn-execute-sell').addEventListener('click', () => processTx('sell'));
document.getElementById('btn-finish-game').addEventListener('click', () => window.finishGame());

// Handle settings
document.getElementById('btn-settings').addEventListener('click', async () => {
    const modal = document.getElementById('modal-backdrop');
    document.getElementById('modal-title').textContent = 'Room Settings';
    
    let bodyHtml = `
        <div class="stack" style="gap: 1rem; padding: 1rem 0;">
            <div class="stack" style="gap: 0.5rem;">
                <label class="text-muted" style="font-size: 0.8rem;">Change Display Name</label>
                <div class="row" style="gap: 0.5rem;">
                    <input type="text" id="new-display-name" value="${currentUser.displayName}" style="flex: 1; height: 40px; padding: 0 0.75rem; border-radius: 8px; border: 1px solid var(--border); background: rgba(255,255,255,0.05); color: white;">
                    <button id="btn-update-name" class="btn btn-primary" style="height: 40px; padding: 0 1rem; font-size: 0.8rem;">Update</button>
                </div>
            </div>
            <hr style="border: 0; border-top: 1px solid var(--border);">
            <div class="stack" style="gap: 0.5rem;">
                <label class="text-muted" style="font-size: 0.8rem;">Sign Out</label>
                <button onclick="auth.signOut().then(() => location.reload())" class="btn-reject" style="padding: 0.75rem; border-radius: 12px; border: 1px solid var(--accent-alt); background: rgba(244, 63, 94, 0.05); cursor: pointer;">Sign Out of Account</button>
            </div>
        </div>
    `;
    
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-ok').style.display = 'none'; // Hide Save button, use inline Update
    document.getElementById('modal-cancel').textContent = 'Close';
    
    modal.style.display = 'flex';

    document.getElementById('btn-update-name').addEventListener('click', async () => {
        const newName = document.getElementById('new-display-name').value.trim();
        if (!newName) return;
        
        try {
            // Update Global Profile
            await setDoc(doc(db, "users", currentUser.uid), { displayName: newName }, { merge: true });
            currentUser.displayName = newName;
            
            // Update Room Player Map
            if (currentRoomId && roomData) {
                const roomRef = doc(db, "games", currentRoomId);
                const updatedPlayers = { ...roomData.players };
                updatedPlayers[currentUser.uid].name = newName;
                await updateDoc(roomRef, { players: updatedPlayers });
            }
            
            alert("Name updated successfully!");
            modal.style.display = 'none';
        } catch (e) {
            console.error(e);
            alert("Failed to update name.");
        }
    });
});

document.getElementById('modal-ok').addEventListener('click', () => {
    document.getElementById('modal-backdrop').style.display = 'none';
    document.getElementById('modal-backdrop').style.display = 'none';
});
