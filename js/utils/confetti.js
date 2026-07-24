/**
 * MetaSafe Confetti Celebration Effect
 * Lightweight confetti animation for successful cleaning
 */

// Confetti configuration
const CONFETTI_CONFIG = {
  particleCount: 100,
  spread: 70,
  startVelocity: 30,
  decay: 0.95,
  gravity: 1,
  ticks: 200,
  colors: ['#00f0ff', '#ff0080', '#bf00ff', '#00ff41', '#ffff00'],
  shapes: ['square', 'circle']
};

/**
 * Create a confetti particle
 */
function createParticle(x, y, config) {
  const particle = document.createElement('div');
  particle.className = 'confetti-particle';
  
  const color = config.colors[Math.floor(Math.random() * config.colors.length)];
  const shape = config.shapes[Math.floor(Math.random() * config.shapes.length)];
  const size = Math.random() * 10 + 5;
  
  particle.style.cssText = `
    position: fixed;
    width: ${size}px;
    height: ${size}px;
    background: ${color};
    left: ${x}px;
    top: ${y}px;
    pointer-events: none;
    z-index: 99999;
    ${shape === 'circle' ? 'border-radius: 50%;' : ''}
    box-shadow: 0 0 ${size}px ${color};
  `;
  
  return particle;
}

/**
 * Animate a single particle
 */
function animateParticle(particle, config) {
  let x = parseFloat(particle.style.left);
  let y = parseFloat(particle.style.top);
  let vx = (Math.random() - 0.5) * config.spread;
  let vy = -Math.random() * config.startVelocity;
  let rotation = Math.random() * 360;
  let rotationSpeed = (Math.random() - 0.5) * 10;
  let opacity = 1;
  let ticks = config.ticks;
  
  function update() {
    if (ticks <= 0 || opacity <= 0) {
      particle.remove();
      return;
    }
    
    vy += config.gravity;
    vx *= config.decay;
    vy *= config.decay;
    
    x += vx;
    y += vy;
    rotation += rotationSpeed;
    opacity -= 1 / config.ticks;
    
    particle.style.left = x + 'px';
    particle.style.top = y + 'px';
    particle.style.transform = `rotate(${rotation}deg)`;
    particle.style.opacity = opacity;
    
    ticks--;
    requestAnimationFrame(update);
  }
  
  requestAnimationFrame(update);
}

/**
 * Fire confetti from a specific point
 * @param {number} x - X coordinate (default: center)
 * @param {number} y - Y coordinate (default: top third)
 * @param {Object} customConfig - Custom configuration
 */
function fireConfetti(x, y, customConfig = {}) {
  const config = { ...CONFETTI_CONFIG, ...customConfig };
  
  // Default to center of screen
  if (x === undefined) {
    x = window.innerWidth / 2;
  }
  if (y === undefined) {
    y = window.innerHeight / 3;
  }
  
  // Create container if it doesn't exist
  let container = document.getElementById('confetti-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'confetti-container';
    container.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 99999;';
    document.body.appendChild(container);
  }
  
  // Create particles
  for (let i = 0; i < config.particleCount; i++) {
    const particle = createParticle(x, y, config);
    container.appendChild(particle);
    animateParticle(particle, config);
  }
}

/**
 * Fire confetti burst (multiple points)
 */
function confettiBurst() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  
  // Fire from multiple points
  fireConfetti(width * 0.25, height * 0.3, { particleCount: 50 });
  fireConfetti(width * 0.75, height * 0.3, { particleCount: 50 });
  
  // Delayed center burst
  setTimeout(() => {
    fireConfetti(width * 0.5, height * 0.2, { particleCount: 80 });
  }, 150);
}

/**
 * Fire confetti cannon from sides
 */
function confettiCannon() {
  const height = window.innerHeight;
  
  // Left cannon
  fireConfetti(0, height * 0.7, {
    particleCount: 60,
    spread: 45,
    startVelocity: 45
  });
  
  // Right cannon
  fireConfetti(window.innerWidth, height * 0.7, {
    particleCount: 60,
    spread: 45,
    startVelocity: 45
  });
}

/**
 * Celebration sequence for successful cleaning
 */
function celebrateCleaning() {
  // Initial burst
  confettiBurst();
  
  // Side cannons after delay
  setTimeout(confettiCannon, 300);
}

/**
 * Simple confetti for single file
 */
function celebrateSingleFile(element) {
  if (!element) {
    fireConfetti();
    return;
  }
  
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top;
  
  fireConfetti(x, y, { particleCount: 50, spread: 50 });
}

// Export functions
export {
  fireConfetti,
  confettiBurst,
  confettiCannon,
  celebrateCleaning,
  celebrateSingleFile
};

// Global access
window.fireConfetti = fireConfetti;
window.celebrateCleaning = celebrateCleaning;
window.celebrateSingleFile = celebrateSingleFile;
