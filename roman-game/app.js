/**
 * State & Constants
 */
const ROLES = [
    { id: 'emperor', name: 'Emperador', icon: '👑' },
    { id: 'senator', name: 'Senador', icon: '📜' },
    { id: 'general', name: 'General', icon: '⚔️' },
    { id: 'citizen', name: 'Ciudadano', icon: '🌾' },
    { id: 'slave', name: 'Esclavo', icon: '⛓️' }
];

let state = {
    players: [
        { id: 'p1', name: 'Jugador 1', role: 'emperor', score: 0 },
        { id: 'p2', name: 'Jugador 2', role: 'general', score: 0 }
    ],
    targetScore: 50,
    startTime: null,
    elapsedTime: 0,
    isPaused: false,
    winner: null
};

let timerInterval;
const HOLD_DELAY = 300; // ms before hold starts
const HOLD_INTERVAL = 100; // ms between adding score while holding

// Audio context for haptic / simple beeps
const playBeep = (freq) => {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = "sine";
        gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
    } catch (e) { }
};

const vibrate = (pattern = 50) => {
    if (navigator.vibrate) {
        navigator.vibrate(pattern);
    }
};

/**
 * DOM Elements
 */
const screens = {
    start: document.getElementById('screen-start'),
    game: document.getElementById('screen-game'),
    victory: document.getElementById('screen-victory')
};

function switchScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenName].classList.add('active');
}

/**
 * Initialization & Setup UI
 */
function init() {
    loadState();
    renderSetup();
    
    document.getElementById('btn-add-player').addEventListener('click', addPlayer);
    document.getElementById('input-target-score').addEventListener('change', (e) => {
        state.targetScore = parseInt(e.target.value) || 50;
        saveState();
    });
    
    document.getElementById('btn-start-game').addEventListener('click', startGame);
    document.getElementById('btn-pause').addEventListener('click', togglePause);
    document.getElementById('btn-rematch').addEventListener('click', rematch);
    document.getElementById('btn-new-game').addEventListener('click', resetToHome);
    
    // Check if there was an active game
    if (state.startTime && !state.winner) {
        resumeGame();
    }
}

function renderSetup() {
    const list = document.getElementById('players-setup-list');
    list.innerHTML = '';
    
    state.players.forEach((p, index) => {
        const div = document.createElement('div');
        div.className = 'player-setup-item';
        
        let roleOptions = ROLES.map(r => 
            `<option value="${r.id}" ${p.role === r.id ? 'selected' : ''}>${r.icon} ${r.name}</option>`
        ).join('');

        div.innerHTML = `
            <input type="text" value="${p.name}" onchange="updatePlayerName(${index}, this.value)">
            <select class="role-select" onchange="updatePlayerRole(${index}, this.value)">
                ${roleOptions}
            </select>
            ${state.players.length > 2 ? `<button class="btn-remove" onclick="removePlayer(${index})">✖</button>` : ''}
        `;
        list.appendChild(div);
    });
    document.getElementById('input-target-score').value = state.targetScore;
}

window.updatePlayerName = (index, name) => { state.players[index].name = name || 'Jugador'; saveState(); };
window.updatePlayerRole = (index, role) => { state.players[index].role = role; saveState(); };
window.removePlayer = (index) => {
    if(state.players.length > 2) {
        state.players.splice(index, 1);
        saveState();
        renderSetup();
    }
}

function addPlayer() {
    if (state.players.length >= 8) return;
    state.players.push({
        id: 'p' + Date.now(),
        name: `Jugador ${state.players.length + 1}`,
        role: 'citizen',
        score: 0
    });
    saveState();
    renderSetup();
}

/**
 * Game Logic
 */
function startGame() {
    state.players.forEach(p => p.score = 0);
    state.startTime = Date.now();
    state.elapsedTime = 0;
    state.winner = null;
    state.isPaused = false;
    saveState();
    
    document.getElementById('game-target').textContent = state.targetScore;
    buildGameUI();
    switchScreen('game');
    startTimer();
}

function resumeGame() {
    document.getElementById('game-target').textContent = state.targetScore;
    buildGameUI();
    switchScreen('game');
    updateAllTracks();
    if (!state.isPaused) startTimer();
    else renderTimer();
}

function resetToHome() {
    state.startTime = null;
    state.elapsedTime = 0;
    state.winner = null;
    saveState();
    switchScreen('start');
}

function rematch() {
    startGame();
}

function updateScore(index, delta) {
    if (state.winner || state.isPaused) return;
    
    state.players[index].score += delta;
    if (state.players[index].score < 0) state.players[index].score = 0; // Prevent negative
    
    if (delta > 0) {
        playBeep(600);
        vibrate(30);
    } else {
        playBeep(300);
        vibrate([30, 50, 30]);
    }
    
    saveState();
    updateTrackUI(index);
    checkWinCondition(index);
}

function checkWinCondition(index) {
    const player = state.players[index];
    if (player.score >= state.targetScore) {
        // Player wins
        state.winner = player;
        clearInterval(timerInterval);
        saveState();
        showVictoryScreen();
    }
}

/**
 * Game UI Updating
 */
function buildGameUI() {
    const trackContainer = document.getElementById('race-track-container');
    const controlsContainer = document.getElementById('player-controls-container');
    trackContainer.innerHTML = '';
    controlsContainer.innerHTML = '';
    
    state.players.forEach((p, index) => {
        const role = ROLES.find(r => r.id === p.role) || ROLES[0];
        
        // Track
        const track = document.createElement('div');
        track.className = 'track';
        track.innerHTML = `
            <div class="track-fill" id="track-fill-${index}"></div>
            <div class="track-icon" id="track-icon-${index}">${role.icon}</div>
            <div class="track-info">
                <div class="track-name">${p.name}</div>
                <div class="track-score" id="track-score-${index}">${p.score}</div>
            </div>
        `;
        trackContainer.appendChild(track);
        
        // Controls
        const cmd = document.createElement('div');
        cmd.className = 'control-panel';
        
        const nameLabel = document.createElement('div');
        nameLabel.className = 'control-name';
        nameLabel.textContent = p.name;
        
        const btnGroup = document.createElement('div');
        btnGroup.className = 'control-buttons';
        
        const btnMinus = document.createElement('button');
        btnMinus.className = 'btn-score btn-minus';
        btnMinus.textContent = '-';
        btnMinus.onclick = () => updateScore(index, -1);
        
        const btnPlus = document.createElement('button');
        btnPlus.className = 'btn-score btn-plus';
        btnPlus.textContent = '+';
        
        // Press & hold feature
        let holdTimeout, holdIntervalObj;
        
        const startHold = (e) => {
            e.preventDefault();
            updateScore(index, 1);
            btnPlus.classList.add('holding');
            holdTimeout = setTimeout(() => {
                holdIntervalObj = setInterval(() => {
                    updateScore(index, 1);
                }, HOLD_INTERVAL);
            }, HOLD_DELAY);
        };
        
        const endHold = (e) => {
            e.preventDefault();
            btnPlus.classList.remove('holding');
            clearTimeout(holdTimeout);
            clearInterval(holdIntervalObj);
        };
        
        btnPlus.addEventListener('mousedown', startHold);
        btnPlus.addEventListener('touchstart', startHold, {passive: false});
        btnPlus.addEventListener('mouseup', endHold);
        btnPlus.addEventListener('mouseleave', endHold);
        btnPlus.addEventListener('touchend', endHold);
        btnPlus.addEventListener('touchcancel', endHold);

        btnGroup.appendChild(btnMinus);
        btnGroup.appendChild(btnPlus);
        
        cmd.appendChild(nameLabel);
        cmd.appendChild(btnGroup);
        controlsContainer.appendChild(cmd);
    });
    
    updateAllTracks();
}

function updateAllTracks() {
    state.players.forEach((p, i) => updateTrackUI(i));
}

function updateTrackUI(index) {
    const p = state.players[index];
    const percentage = Math.min((p.score / state.targetScore) * 100, 100);
    
    const fill = document.getElementById(`track-fill-${index}`);
    const scoreEl = document.getElementById(`track-score-${index}`);
    const icon = document.getElementById(`track-icon-${index}`);
    
    if(fill) fill.style.width = percentage + '%';
    if(scoreEl) scoreEl.textContent = p.score;
    // Move icon to match fill
    if(icon) {
        // approx map 0% to 10px from left, 100% to 10px from right
        // better keeping icon on the right side of the fill
    }
}

/**
 * Timer
 */
function startTimer() {
    clearInterval(timerInterval);
    state.startTime = Date.now() - state.elapsedTime;
    timerInterval = setInterval(() => {
        state.elapsedTime = Date.now() - state.startTime;
        renderTimer();
    }, 1000);
}

function togglePause() {
    if (state.winner) return;
    state.isPaused = !state.isPaused;
    if (state.isPaused) {
        clearInterval(timerInterval);
        document.getElementById('btn-pause').textContent = '▶️';
    } else {
        startTimer();
        document.getElementById('btn-pause').textContent = '⏸';
    }
    saveState();
}

function renderTimer() {
    const t = document.getElementById('game-timer');
    const totalSeconds = Math.floor(state.elapsedTime / 1000);
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    t.textContent = `${m}:${s}`;
}

/**
 * Victory
 */
function showVictoryScreen() {
    const winner = state.winner;
    const role = ROLES.find(r => r.id === winner.role) || ROLES[0];
    
    document.getElementById('winner-emblem').textContent = role.icon;
    document.getElementById('winner-name').textContent = winner.name;
    document.getElementById('winner-role').textContent = role.name;
    document.getElementById('winner-time').textContent = document.getElementById('game-timer').textContent;
    
    switchScreen('victory');
    
    // Confetti
    if (window.confetti) {
        const duration = 3000;
        const end = Date.now() + duration;

        (function frame() {
            confetti({
                particleCount: 5,
                angle: 60,
                spread: 55,
                origin: { x: 0 },
                colors: ['#d4af37', '#8b0000']
            });
            confetti({
                particleCount: 5,
                angle: 120,
                spread: 55,
                origin: { x: 1 },
                colors: ['#d4af37', '#8b0000']
            });

            if (Date.now() < end) {
                requestAnimationFrame(frame);
            }
        }());
    }
    vibrate([100, 50, 100, 50, 200]);
}

/**
 * Persistence
 */
function saveState() {
    localStorage.setItem('romanGameState', JSON.stringify(state));
}

function loadState() {
    const saved = localStorage.getItem('romanGameState');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            // shallow merge
            state = { ...state, ...parsed };
        } catch (e) {
            console.error(e);
        }
    }
}

// Bootstrap
window.addEventListener('DOMContentLoaded', init);
