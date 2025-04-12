const gameState = {
    tiles: [],
    timer: null,
    isPlaying: false,
    timeLimits: {
        easy: 8,
        medium: 6,
        hard: 4,
        death: 3
    },
    timeLeft: 0,
    score: 0,
    difficulty: 'easy',
    highScores: {
        easy: 0,
        medium: 0,
        hard: 0,
        death: 0
    },
    bestAverageTimes: {
        easy: null,
        medium: null,
        hard: null,
        death: null
    },
    previousBestScore: 0,
    previousBestTime: null,
    clickedTiles: new Set(),
    needsUpdate: false,
    processingClick: false,
    animationFrameId: null,
    levelStartTime: 0,
    totalReactionTime: 0,
    correctClicks: 0
};

// Simple storage functions
const store = {
    get: (key, defaultValue) => localStorage.getItem(`oddcolorout-${key}`) || defaultValue,
    set: (key, value) => localStorage.setItem(`oddcolorout-${key}`, value),
    session: {
        get: (key, defaultValue) => sessionStorage.getItem(`oddcolorout-${key}`) || defaultValue,
        set: (key, value) => sessionStorage.setItem(`oddcolorout-${key}`, value)
    }
};

const difficultySettings = {
    easy: {
        gridSize: 2,
        sat: { init: 70, dec: 0.5, min: 30 },
        light: { range: 10, base: 50 }
    },
    medium: {
        gridSize: 3,
        sat: { init: 60, dec: 1.0, min: 25 },
        light: { range: 8, base: 50 }
    },
    hard: {
        gridSize: 4,
        sat: { init: 50, dec: 1.5, min: 20 },
        light: { range: 6, base: 50 }
    },
    death: {
        gridSize: 5,
        sat: { init: 40, dec: 2.0, min: 15 },
        light: { range: 4, base: 50 }
    }
};

const $ = id => document.getElementById(id);
const isTouchDevice = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;

const clearTimers = () => {
    clearInterval(gameState.timer);
    if (gameState.animationFrameId) {
        cancelAnimationFrame(gameState.animationFrameId);
        gameState.animationFrameId = null;
    }
};

const generateColors = ({
    sat,
    light
}) => {
    const hue = Math.floor(Math.random() * 360);
    const saturation = Math.max(sat.init - Math.min(gameState.score, 20) * sat.dec, sat.min);
    const lightVar = Math.max(light.range - (gameState.score * 0.2), 2);
    const baseLightness = light.base + (Math.random() * 10 - 5);
    const diff = (Math.random() < 0.5 ? -1 : 1) * lightVar;
    return {
        base: `hsl(${hue}, ${saturation}%, ${baseLightness}%)`,
        different: `hsl(${hue}, ${saturation}%, ${baseLightness + diff}%)`
    };
};

const createTile = (color, isDifferent) => {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.style.backgroundColor = color;
    
    if (isDifferent) {
        tile.dataset.different = 'true';
    }
    
    return tile;
};

const generateTiles = gridSize => {
    const colors = generateColors(difficultySettings[gameState.difficulty]);
    const diffIndex = Math.floor(Math.random() * gridSize ** 2);
    
    return Array.from({ length: gridSize ** 2 }, (_, i) => 
        createTile(i === diffIndex ? colors.different : colors.base, i === diffIndex));
};

// Helper to manage post-game hint
const showPostGameHint = (show = true, message = "Hint text") => {
    const hintEl = $('post-game-hint');
    if (!hintEl) return;

    if (show) {
        hintEl.textContent = message;
        hintEl.style.display = 'block'; // Use block, not flex
         // Timeout for transition
        setTimeout(() => hintEl.classList.add('visible'), 10);
    } else {
        hintEl.classList.remove('visible');
         // Set display none after transition
        setTimeout(() => hintEl.style.display = 'none', 300); 
    }
};

// Modify closeMessage
const closeMessage = (isGameOver = false) => {
    $('message-overlay').classList.remove('active');
    // Remove the premature hide call
    // showPostGameHint(false); 
    
    if (isGameOver && !gameState.isPlaying) { // Check isGameOver flag
        const correctTile = document.querySelector('[data-different="true"]');
        if (correctTile) { 
            correctTile.style.borderBottom = `6px solid var(--color-text-primary)`;
            // Show hint *after* border is applied
            showPostGameHint(true, "Highlighted tile was the correct one. Select difficulty to play again!");
        } 
        // No need for an else here, startGame handles hiding
    }
};

const showMessage = (message, duration = 2000) => {
    const content = $('message-content');
    content.innerHTML = `<button class="close-button" onclick="closeMessage()">×</button><div>${message}</div>`;
    $('message-overlay').classList.add('active');
    
    if (duration > 0) setTimeout(() => closeMessage(), duration);
};

// Helper for random titles based on performance
const getGameOverTitle = (didBeatScore, didBeatTime) => {
    const scoreTitles = ["Score Smasher!", "Point Powerhouse!", "Top Scorer!", "Impressive Score!"];
    const timeTitles = ["Lightning Fast!", "Nice Flicks!", "Speed Demon!", "God Speed!"];
    const bothTitles = ["Unstoppable!", "All-Rounder!", "Dual Record!", "Truly Skilled!"];
    const noneTitles = ["Game Over", "Try Again?", "Get Good?", "Keep Practicing!", "You Suck!", "You're a Loser!", "Are you even trying?"];
    const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

    if (didBeatScore && didBeatTime) return getRandom(bothTitles);
    if (didBeatScore) return getRandom(scoreTitles);
    if (didBeatTime) return getRandom(timeTitles);
    return getRandom(noneTitles);
};

// Helper to format result lines
const formatResultLine = (label, currentValue, previousBest, isTime = false) => {
    const currentFormatted = isTime ? `${currentValue.toFixed(3)}s` : currentValue;
    const previousFormatted = isTime ? (previousBest !== null ? `${previousBest.toFixed(3)}s` : 'N/A') : previousBest;
    const beatPrevious = isTime ? (previousBest !== null && currentValue < previousBest) : (currentValue > previousBest);

    if (beatPrevious) {
        return `<span class="current-value new-best">${label}: ${currentFormatted}</span><span class="last-best">Last Best: ${previousFormatted}</span>`;
    } else {
        const bestToShow = isTime ? (previousBest !== null ? `${previousBest.toFixed(3)}s` : 'None') : previousBest;
        return `<span class="current-value">${label}: ${currentFormatted}</span><span class="last-best">Last Best: ${bestToShow}</span>`;
    }
};

// Updated Game Over Message function
const showGameOverMessage = () => {
    const { score, difficulty, correctClicks, totalReactionTime, highScores, bestAverageTimes, previousBestScore, previousBestTime } = gameState;
    const MIN_CLICKS_FOR_AVG = 3; // Minimum correct clicks to show average time

    let averageTime = null;
    let timeLine = ''; // Initialize timeLine outside the conditional
    let didBeatScore = score > previousBestScore;
    let didBeatTime = false;

    // Calculate average time only if threshold is met
    if (correctClicks >= MIN_CLICKS_FOR_AVG) {
        averageTime = totalReactionTime / correctClicks / 1000; // in seconds
        didBeatTime = previousBestTime === null || averageTime < previousBestTime;

        // Update best time if beaten
        if (didBeatTime) {
            bestAverageTimes[difficulty] = averageTime;
            store.set(`besttime-${difficulty}`, averageTime.toFixed(3));
        }
        // Generate time result string only if calculated
        timeLine = formatResultLine("Avg. Time", averageTime, previousBestTime, true);
    }

    // Update high score if beaten
    if (didBeatScore) {
        highScores[difficulty] = score;
        store.set(`highscore-${difficulty}`, score);
    }

    // Generate score result string
    const scoreLine = formatResultLine("Score", score, previousBestScore);

    // Get dynamic title (can still be influenced by beating time even if not displayed)
    const title = getGameOverTitle(didBeatScore, didBeatTime);

    // Construct HTML
    $('message-content').innerHTML = `
        <button class="close-button" onclick="closeMessage(true)" aria-label="Close">×</button>
        <div>
            <h2 class="game-over-title">${title}</h2>
            ${scoreLine}
            ${timeLine} <!-- This will be empty if threshold not met -->
            <p class="correct-tile-hint">(Close to see correct tile)</p>
            <button class="play-again-button" onclick="startGame('${difficulty}')">Play Again</button>
        </div>`;

    $('message-overlay').classList.add('active');

    // Trigger confetti if any record was beaten (regardless of threshold for display)
    if (didBeatScore || didBeatTime) {
        setTimeout(() => {
            const confettiConfig = { // Assume existing confettiConfig is defined elsewhere or paste it here
                particleCount: 200,
                spread: 90,
                origin: { y: 0.5, x: 0.5 },
                colors: ['#FFD700', '#FFA500', '#FF4500', '#008000', '#4169E1', '#9C27B0'],
                disableForReducedMotion: true
            };
            confetti(confettiConfig);
            // Additional bursts...
            [
                { delay: 200, config: { particleCount: 100, angle: 60, spread: 60, origin: { x: 0, y: 0.5 }}},
                { delay: 400, config: { particleCount: 100, angle: 120, spread: 60, origin: { x: 1, y: 0.5 }}},
                { delay: 600, config: { particleCount: 150, startVelocity: 30, spread: 70, origin: { x: 0.5, y: 0.5 }, gravity: 1}}
            ].forEach(({ delay, config }) => setTimeout(() => confetti(config), delay));
        }, 300);
    }
};

const handleGuess = (tile, isCorrect) => {
    if (isCorrect) {
        // Calculate reaction time for this level
        const reactionTime = Date.now() - gameState.levelStartTime;
        gameState.totalReactionTime += reactionTime;
        gameState.correctClicks++;

        tile.classList.add('correct');
        gameState.score++;
        
        // Check for high score
        const { score, difficulty, highScores } = gameState;
        if (score > highScores[difficulty]) {
            highScores[difficulty] = score;
            store.set(`highscore-${difficulty}`, score);
        }
        
        resetTimer();
        setTimeout(() => {
            newLevel();
            gameState.processingClick = false;
        }, 800);
    } else {
        tile.classList.add('wrong');
        gameState.clickedTiles.add(tile);
        endGame();
        gameState.processingClick = false;
    }
};

const startTimer = () => {
    clearTimers();
    
    // Set up animation frame based timer
    const totalTime = gameState.timeLimits[gameState.difficulty] * 1000;
    const startTime = Date.now();
    const progressBar = $('progress-bar');
    const timeDisplay = $('time-display');
    
    const updateProgress = () => {
        if (!gameState.isPlaying) return;
        
        const elapsedTime = Date.now() - startTime;
        const remainingPercent = Math.max(0, 100 - (elapsedTime / totalTime * 100));
        
        // Update UI
        progressBar.style.width = `${remainingPercent}%`;
        gameState.timeLeft = Math.max(0, Math.ceil((totalTime - elapsedTime) / 1000));
        timeDisplay.textContent = `${gameState.timeLeft}s`;
        
        // Handle low time warning
        const isLowTime = gameState.timeLeft <= Math.ceil(gameState.timeLimits[gameState.difficulty] / 3);
        progressBar.classList.toggle('low', isLowTime);
        timeDisplay.style.color = isLowTime ? 'var(--wrong)' : 'var(--primary)';
        
        gameState.needsUpdate = true;
        
        // Check for time up
        if (gameState.timeLeft <= 0) {
            endGame();
            return;
        }
        
        gameState.animationFrameId = requestAnimationFrame(updateProgress);
    };
    
    gameState.animationFrameId = requestAnimationFrame(updateProgress);
};

const resetTimer = () => {
    clearTimers();
    
    // Reset timer state
    const { difficulty, timeLimits } = gameState;
    gameState.timeLeft = timeLimits[difficulty];
    
    // Reset UI
    const progressBar = $('progress-bar');
    progressBar.style.width = '100%';
    progressBar.classList.remove('low');
    $('time-display').textContent = `${gameState.timeLeft}s`;
    $('time-display').style.color = 'var(--primary)';
    
    // Allow transition to complete before starting new timer
    setTimeout(startTimer, 50);
};

// Function to show/hide empty state
const showEmptyState = (show = true, message = "Select a difficulty from below to begin!") => {
    const emptyState = $('empty-state');
    if (!emptyState) return; // Element might not exist yet on initial load sometimes

    if (show) {
        emptyState.innerHTML = `<p>${message}</p>`;
        emptyState.style.display = 'flex'; // Ensure it's displayed
        // Timeout to allow display change before opacity transition
        setTimeout(() => emptyState.classList.add('visible'), 10); 
    } else {
        emptyState.classList.remove('visible');
        // Hide after transition
        setTimeout(() => emptyState.style.display = 'none', 300); // Match CSS transition
    }
};

const endGame = () => {
    clearTimers();
    gameState.isPlaying = false;
    gameState.processingClick = false;
    // Show empty state again before game over message
    showEmptyState(true, "Game Over! Select difficulty to play again."); 
    showGameOverMessage(); 
};

// Modify startGame
const startGame = difficulty => {
    showEmptyState(false); 
    showPostGameHint(false); // Hide hint on game start

    // Load current bests first before resetting gameState
    const currentHighScore = gameState.highScores[difficulty] || 0;
    const currentBestTime = gameState.bestAverageTimes[difficulty] || null;

    // Reset game state
    Object.assign(gameState, {
        difficulty,
        timeLeft: gameState.timeLimits[difficulty],
        score: 0,
        isPlaying: true,
        needsUpdate: true,
        processingClick: false,
        levelStartTime: 0,       
        totalReactionTime: 0,
        correctClicks: 0,
        previousBestScore: currentHighScore,
        previousBestTime: currentBestTime
    });
    gameState.clickedTiles.clear();
    
    // Reset UI
    const progressBar = $('progress-bar');
    progressBar.style.width = '100%';
    progressBar.classList.remove('low');
    $('time-display').textContent = `${gameState.timeLeft}s`;
    $('time-display').style.color = 'var(--color-primary)';
    $('message-overlay').classList.remove('active');
    
    // Start new game
    newLevel();
    startTimer();
};

const handleTileClick = (tile) => {
    if (gameState.isPlaying && 
        tile && 
        !tile.classList.contains('clicked') && 
        !gameState.processingClick) {
        
        gameState.processingClick = true;
        tile.classList.add('clicked');
        handleGuess(tile, tile.dataset.different === 'true');
    }
};

const gameGrid = $('game-grid');
gameGrid.addEventListener('click', e => {
    const tile = e.target.closest('.tile');
    handleTileClick(tile);
});

const adjustGridSize = () => {
    const gameGrid = $('game-grid');
    const { difficulty } = gameState;
    const { gridSize } = difficultySettings[difficulty];
    
    // Remove previous grid size classes but keep any other classes
    const currentClasses = gameGrid.className.split(' ').filter(cls => !cls.startsWith('grid-size-'));
    gameGrid.className = currentClasses.join(' ');
    
    // Add grid size class
    gameGrid.classList.add(`grid-size-${gridSize}`);
    
    // Set tile size CSS variable based on grid size
    document.documentElement.style.setProperty('--tile-size', `var(--tile-size-${gridSize})`);
};

const newLevel = () => {
    const { difficulty } = gameState;
    const gridSize = difficultySettings[difficulty].gridSize;
    
    // Clear previous state
    gameState.clickedTiles.clear();
    
    // Generate new tiles
    gameState.tiles = generateTiles(gridSize);
    
    // Clear and populate grid
    while (gameGrid.firstChild) gameGrid.removeChild(gameGrid.firstChild);
    gameState.tiles.forEach(tile => gameGrid.appendChild(tile));
    
    // Update layout
    adjustGridSize();
    gameState.needsUpdate = true;

    // Record level start time for reaction calculation
    gameState.levelStartTime = Date.now(); 
};

const setTheme = theme => {
    document.body.classList.toggle('dark-mode', theme === 'dark');
    store.set('theme', theme);
    $('theme-toggle').textContent = theme === 'dark' ? '☀️' : '🌙';
};

const setTileShape = shape => {
    // Update class on body to control tile shape via CSS
    document.body.classList.remove('shape-circle', 'shape-square');
    document.body.classList.add(`shape-${shape}`);
    
    // Update store and toggle icon
    store.set('tile-shape', shape);
    $('shape-toggle').textContent = shape === 'circle' ? '⬜' : '⚪';
    
    // Force a refresh of all tiles by reapplying the grid size
    adjustGridSize();
};

const openSettings = () => {
    $('settings-overlay').classList.add('active');
};

const closeSettings = () => {
    $('settings-overlay').classList.remove('active');
};

const initEventListeners = () => {
    // Helper function for registering events
    const on = (selector, event, handler, options) => {
        const element = typeof selector === 'string' ? $(selector) : selector;
        // Check if the element was found before adding listener
        if (element) { 
            element.addEventListener(event, handler, options);
        } else {
            // Optionally log a warning if an element isn't found
            console.warn(`Element not found for selector: ${selector}`); 
        }
    };
            
    // Button listeners for difficulty levels
    ['easy', 'medium', 'hard', 'death']
        .forEach(diff => on(`${diff}-btn`, 'click', () => startGame(diff)));
        
    // Settings panel
    on('settings-button', 'click', openSettings);
    on('close-settings', 'click', closeSettings);
    on('settings-overlay', 'click', e => e.target === $('settings-overlay') && closeSettings());
    
    // Theme and shape toggles
    on('theme-toggle', 'click', () => 
        setTheme(document.body.classList.contains('dark-mode') ? 'light' : 'dark'));
        
    on('shape-toggle', 'click', () => {
        const currentShape = store.get('tile-shape', 'circle');
        const newShape = currentShape === 'circle' ? 'square' : 'circle';
        setTileShape(newShape);
    });

    // Touch handling
    if (isTouchDevice()) {
        on(document, 'touchend', e => {
            const { target } = e;
            const button = target.closest('button');
            
            if (button) {
                e.preventDefault();
                button.click();
                return;
            }
            
            handleTileClick(target.closest('.tile'));
        }, { passive: false });
    }

    // Keyboard shortcuts
    const keyMap = {
        e: 'easy', m: 'medium', h: 'hard', d: 'death',
        r: () => startGame(gameState.difficulty),
        t: () => setTheme(document.body.classList.contains('dark-mode') ? 'light' : 'dark')
    };
    
    on(document, 'keydown', ({ key }) => {
        const action = keyMap[key.toLowerCase()];
        if (action) typeof action === 'function' ? action() : startGame(action);
    });

    // Debounced resize handling
    on(window, 'resize', debounce(adjustGridSize, 250));
    on(window, 'orientationchange', () => {
        // Force immediate resize on orientation change 
        setTimeout(adjustGridSize, 50);
    });
};

// Simple debounce function
const debounce = (fn, delay) => {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
};

document.addEventListener('DOMContentLoaded', () => {
    // Initialize high scores from localStorage
    Object.keys(gameState.highScores).forEach(diff => {
        const saved = store.get(`highscore-${diff}`);
        if (saved) gameState.highScores[diff] = parseInt(saved);
    });

    // Initialize best average times from localStorage
    Object.keys(gameState.bestAverageTimes).forEach(diff => {
        const savedTime = store.get(`besttime-${diff}`);
        if (savedTime) gameState.bestAverageTimes[diff] = parseFloat(savedTime);
    });

    // Initialize theme 
    setTheme(store.get('theme', window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
    
    // Initialize tile shape
    const savedShape = store.get('tile-shape', 'circle');
    setTileShape(savedShape);
    
    // Make sure toggle button has correct icon
    $('shape-toggle').textContent = savedShape === 'circle' ? '⬜' : '⚪';
    
    // Set up event listeners
    initEventListeners();

    // Ensure grid is properly sized
    adjustGridSize();
    
    // Show empty state on load
    showEmptyState(true);
    
    // Run adjustGridSize again after all images and fonts are loaded
    window.addEventListener('load', () => {
        setTimeout(adjustGridSize, 100);
    });
    
    // Set up update loop for score display
    (function updateLoop() {
        if (gameState.needsUpdate) {
            $('score-display').textContent = gameState.score;
            $('high-score-display').textContent = gameState.highScores[gameState.difficulty];
            gameState.needsUpdate = false;
        }
        requestAnimationFrame(updateLoop);
    })();

    // Show welcome message for fresh sessions
    if (store.session.get('welcomed') !== 'true') {
        store.session.set('welcomed', 'true');
        showMessage(`
<div class="welcome-section">
        <h2>Welcome to Odd Color Out!</h2>
        <p>A simple game to find the tile with the odd color out!</p>
</div>
    <div class="info-section">
        <span>Difficulty Levels</span>
        <div class="difficulty-container">
        <span><b>Easy:</b> 2×2 — 8s</span>
        <span><b>Medium:</b> 3×3 — 6s</span>
        <span><b>Hard:</b> 4×4 — 4s</span>
        <span><b>💀:</b> 5×5 — 3s</span>
    </div>
</div>
    <button class="start-button okay-button" onclick="closeMessage()">Okay!</button> 
`, 0);
    }
});