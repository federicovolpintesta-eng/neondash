const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const rootStyles = getComputedStyle(document.documentElement);
const bgColor = rootStyles.getPropertyValue('--bg-color').trim() || '#0b0c10';
const playerColor = rootStyles.getPropertyValue('--player-color').trim() || '#00e5ff';
const obstacleColor = rootStyles.getPropertyValue('--obstacle-color').trim() || '#ff007f';

const hud = document.getElementById('hud');
const scoreDisplay = document.getElementById('scoreDisplay');
const startScreen = document.getElementById('startScreen');
const startBtn = document.getElementById('startBtn');
const gameOverScreen = document.getElementById('gameOverScreen');
const finalScoreSpan = document.getElementById('finalScore');
const retryBtn = document.getElementById('retryBtn');
const npsPanel = document.getElementById('npsPanel');
const npsButtons = document.querySelectorAll('.nps-btn');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

let lastTime = 0;
let isGameStarted = false;
let isGameOver = false;
let score = 0;
let gamesPlayed = 0; // Para rastrear las partidas y mostrar el NPS
let gameStartTime = 0; // Guardamos el momento exacto en que empieza a jugar
let survivedSeconds = 0; // Calcularemos esto al morir
let obstacles = [];
let particles = [];
let spawnTimer = 0;
let animationId;

const SPAWN_INTERVAL = 1500; 
const OBSTACLE_SPEED = 0.35; 

// --- Web Audio API (Game Feel Sonoro) ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playSound(type) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    if (type === 'jump') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'score') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(400, audioCtx.currentTime);
        osc.frequency.setValueAtTime(800, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
    } else if (type === 'crash') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
    }
}

// --- Clases ---
class Player {
    constructor() {
        this.width = 40;
        this.height = 40;
        this.x = Math.min(50, canvas.width * 0.1); 
        this.y = canvas.height / 2;
        this.velocityY = 0;
        this.gravity = 0.0035; 
        this.jumpStrength = -1.1; 
        this.color = playerColor; 
    }
    update(deltaTime) {
        this.velocityY += this.gravity * deltaTime;
        this.y += this.velocityY * deltaTime;

        if (this.y + this.height > canvas.height) {
            this.y = canvas.height - this.height;
            this.velocityY = 0;
        }
        if (this.y < 0) {
            this.y = 0;
            this.velocityY = 0;
        }
    }
    draw(ctx) {
        if (isGameOver) return; // Si chocó, desaparece el bloque, quedando solo las partículas
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.shadowBlur = 0; 
    }
    jump() {
        this.velocityY = this.jumpStrength;
        playSound('jump'); // Feedback sonoro
    }
}

class Obstacle {
    constructor(x, y, width, height, isTop) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.color = obstacleColor; 
        this.isTop = isTop;
    }
    update(deltaTime) {
        this.x -= OBSTACLE_SPEED * deltaTime;
    }
    draw(ctx) {
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.shadowBlur = 0;
    }
}

// --- Sistema de Partículas ---
class Particle {
    constructor(x, y, color, speed, size) {
        this.x = x;
        this.y = y;
        this.color = color;
        const angle = Math.random() * Math.PI * 2;
        const velocity = Math.random() * speed;
        this.velocityX = Math.cos(angle) * velocity;
        this.velocityY = Math.sin(angle) * velocity;
        this.size = Math.random() * size + 2;
        this.life = 1.0;
        this.decay = Math.random() * 0.02 + 0.01; 
    }
    update(deltaTime) {
        this.x += this.velocityX * deltaTime;
        this.y += this.velocityY * deltaTime;
        this.life -= this.decay * (deltaTime / 16); 
    }
    draw(ctx) {
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.size, this.size);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1.0;
    }
}

function spawnParticles(x, y, color, count, speed, size) {
    for(let i = 0; i < count; i++) {
        particles.push(new Particle(x, y, color, speed, size));
    }
}

function checkAABB(rectA, rectB) {
    if (isGameOver) return false;
    return (
        rectA.x < rectB.x + rectB.width &&
        rectA.x + rectA.width > rectB.x &&
        rectA.y < rectB.y + rectB.height &&
        rectA.y + rectA.height > rectB.y
    );
}

let player = new Player();

function spawnObstacle() {
    const width = 60;
    const gap = 200; 
    const minHeight = 50;
    
    const maxTopHeight = canvas.height - gap - minHeight;
    const topHeight = Math.floor(Math.random() * (maxTopHeight - minHeight + 1) + minHeight);
    
    obstacles.push(new Obstacle(canvas.width, 0, width, topHeight, true));
    
    const bottomY = topHeight + gap;
    const bottomHeight = canvas.height - bottomY;
    obstacles.push(new Obstacle(canvas.width, bottomY, width, bottomHeight, false));
}

function handleJump(e) {
    // Si el toque fue sobre un botón (ej: Jugar, Reintentar, NPS, Compartir), ignorar para no bloquear el clic real
    if (e && e.target && e.target.closest && e.target.closest('button')) {
        return;
    }

    // Prevenir comportamientos por defecto (scroll/zoom en móvil) de forma segura en el resto del canvas
    if (e && e.type === 'touchstart' && e.cancelable) {
        e.preventDefault();
    }
    
    // Si el juego está corriendo, saltar
    if (isGameStarted && !isGameOver) {
        player.jump();
    }
}

// Usar document en vez de window para mejor compatibilidad móvil
document.addEventListener('mousedown', handleJump);
document.addEventListener('touchstart', handleJump, { passive: false });
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.key === ' ') {
        // Evitar scroll con espacio, asegurando que no estamos en un input/botón accidental
        if (e.cancelable && (!e.target || !e.target.closest || !e.target.closest('button'))) {
            e.preventDefault();
        }
        handleJump(e);
    }
});

function update(deltaTime) {
    if (!isGameOver) {
        player.update(deltaTime);

        spawnTimer += deltaTime;
        if (spawnTimer >= SPAWN_INTERVAL) {
            spawnObstacle();
            spawnTimer = 0;
        }

        for (let i = obstacles.length - 1; i >= 0; i--) {
            let obs = obstacles[i];
            obs.update(deltaTime);
            
            if (checkAABB(player, obs)) {
                triggerGameOver();
            }

            if (obs.x + obs.width < 0) {
                if (obs.isTop && !isGameOver) {
                    score++;
                    scoreDisplay.innerText = score;
                    
                    playSound('score'); // Sonido de punto
                    // Partículas de celebración doradas
                    spawnParticles(player.x, player.y, '#f59e0b', 15, 0.4, 5);
                }
                obstacles.splice(i, 1);
            }
        }
    }

    // Siempre actualizamos las partículas (incluso en game over)
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update(deltaTime);
        if (particles[i].life <= 0) {
            particles.splice(i, 1);
        }
    }
}

function draw() {
    ctx.fillStyle = bgColor; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    obstacles.forEach(obs => obs.draw(ctx));
    player.draw(ctx);
    particles.forEach(p => p.draw(ctx)); // Dibujar partículas encima
}

function gameLoop(timestamp) {
    if (!isGameStarted) return;

    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;

    update(deltaTime);
    draw();

    // El loop continúa siempre para que las partículas se terminen de animar
    animationId = requestAnimationFrame(gameLoop);
}

function triggerGameOver() {
    isGameOver = true;
    gamesPlayed++; // Incrementar contador de partidas
    
    // Calcular cuántos segundos sobrevivió el jugador
    survivedSeconds = Math.floor((performance.now() - gameStartTime) / 1000);
    
    playSound('crash'); // Sonido de colisión
    
    // Añadir efecto Screen Shake (CSS acelerado por hardware)
    canvas.classList.add('shake');
    setTimeout(() => { canvas.classList.remove('shake'); }, 400);

    // Explosión masiva de partículas simulando la destrucción del jugador
    spawnParticles(player.x + player.width/2, player.y + player.height/2, playerColor, 60, 0.8, 6);
    
    finalScoreSpan.innerText = score;
    hud.classList.add('hidden'); 
    
    // Lógica NPS: Aparece 1 de cada 3 muertes
    if (gamesPlayed % 3 === 0) {
        npsPanel.classList.remove('hidden');
    } else {
        npsPanel.classList.add('hidden');
    }
    
    gameOverScreen.classList.remove('hidden'); 
}

function startGame() {
    initAudio(); // Arrancar o reanudar el contexto de audio
    isGameStarted = true;
    isGameOver = false;
    
    player = new Player();
    obstacles = [];
    particles = [];
    score = 0;
    scoreDisplay.innerText = '0';
    spawnTimer = 0;
    
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    hud.classList.remove('hidden');
    
    retryBtn.disabled = false;
    retryBtn.innerText = 'REINTENTAR';
    
    cancelAnimationFrame(animationId); // Previene que se acumulen llamadas al Game Loop
    lastTime = performance.now();
    gameStartTime = lastTime; // Registramos que inició justo ahora
    gameLoop(lastTime);
}

startBtn.addEventListener('click', startGame);

async function mostrarAnuncio() {
    gameOverScreen.classList.add('hidden');
    
    ctx.fillStyle = '#0b0c10'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = playerColor;
    ctx.font = 'bold 36px Poppins, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Mostrando anuncio publicitario...', canvas.width / 2, canvas.height / 2);
    
    ctx.fillStyle = '#94a3b8';
    ctx.font = '20px Poppins, sans-serif';
    ctx.fillText('(3 segundos...)', canvas.width / 2, canvas.height / 2 + 50);

    await new Promise(resolve => setTimeout(resolve, 3000));
    
    startGame();
}

retryBtn.addEventListener('click', async () => {
    initAudio(); 
    retryBtn.disabled = true;
    retryBtn.innerText = 'CARGANDO AD...';
    await mostrarAnuncio();
});

// --- Lógica de Sistema de Feedback (NPS) ---
npsButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
        const npsScore = parseInt(e.target.getAttribute('data-value'), 10);
        submitNPS(npsScore);
        
        // Ocultar el panel tras votar para no molestar más al usuario
        npsPanel.classList.add('hidden'); 
    });
});

function submitNPS(npsScore) {
    // Clasificación estricta de Net Promoter Score
    let category = 'Detractor';
    if (npsScore >= 9) category = 'Promotor';
    else if (npsScore >= 7) category = 'Pasivo';
    
    const payload = {
        event: 'nps_feedback',
        score: npsScore,
        category: category,
        timestamp: new Date().toISOString()
    };
    
    // Simulación de la comunicación asíncrona a un backend
    console.log('%c[BACKEND] %cSe recibieron datos estructurados de retroalimentación:', 'color: #ff007f; font-weight: bold;', 'color: #94a3b8;');
    console.log(JSON.stringify(payload, null, 2));
}

// --- Lógica de Viralidad (Web Share API) ---
const shareNativeBtn = document.getElementById('shareNativeBtn');
const shareFallback = document.getElementById('shareFallback');
const shareWaBtn = document.getElementById('shareWaBtn');
const shareTwBtn = document.getElementById('shareTwBtn');

// Detectar soporte para el menú nativo de compartir (Soportado en la mayoría de móviles y Safari Mac)
if (navigator.share) {
    shareNativeBtn.classList.remove('hidden');
} else {
    // Si estamos en un navegador de escritorio antiguo, mostramos botones de Redes Sociales
    shareFallback.classList.remove('hidden');
}

function getShareText() {
    return `¡Acabo de sobrevivir ${survivedSeconds} segundos y conseguí ${score} puntos! ¿Puedes superarme?`;
}

const simulatedUrl = 'https://neondash.dev'; // Un enlace falso para el ejemplo

shareNativeBtn.addEventListener('click', async () => {
    try {
        await navigator.share({
            title: 'Neon Dash Challenge',
            text: getShareText(),
            url: simulatedUrl
        });
        console.log('%c[VIRALIDAD] %cSe ha abierto el menú nativo de compartir.', 'color: #00e5ff; font-weight: bold;', 'color: #94a3b8;');
    } catch (err) {
        console.log('El usuario canceló o el navegador bloqueó la acción de compartir:', err);
    }
});

shareWaBtn.addEventListener('click', () => {
    const text = encodeURIComponent(getShareText() + ' Juega gratis aquí: ' + simulatedUrl);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
});

shareTwBtn.addEventListener('click', () => {
    const text = encodeURIComponent(getShareText());
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(simulatedUrl)}`, '_blank');
});

// Dibujo inicial 
draw();
