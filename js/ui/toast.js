/**
 * MetaSafe Toast Notifications
 * Beautiful, animated notification system
 */

class Toast {
  constructor() {
    this.container = null;
    this.queue = [];
    this.init();
  }

  init() {
    // Create container
    this.container = document.createElement('div');
    this.container.id = 'toast-container';
    this.container.className = 'toast-container';
    document.body.appendChild(this.container);
  }

  /**
   * Show a toast notification
   * @param {string} message - The message to display
   * @param {string} type - 'success', 'error', 'warning', 'info'
   * @param {number} duration - Auto-dismiss time in ms (0 = no auto-dismiss)
   */
  show(message, type = 'info', duration = 4000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };
    
    // Build static structure, then inject icon + message via textContent so a
    // message containing a filename/metadata value can never be parsed as HTML (XSS).
    toast.innerHTML = `
      <span class="toast-icon"></span>
      <span class="toast-message"></span>
      <button class="toast-close" aria-label="Kapat">×</button>
    `;
    toast.querySelector('.toast-icon').textContent = icons[type] || icons.info;
    toast.querySelector('.toast-message').textContent = message;
    
    // Close button handler
    toast.querySelector('.toast-close').addEventListener('click', () => {
      this.dismiss(toast);
    });
    
    // Add to container
    this.container.appendChild(toast);
    
    // Trigger animation
    requestAnimationFrame(() => {
      toast.classList.add('toast-show');
    });
    
    // Auto dismiss
    if (duration > 0) {
      setTimeout(() => this.dismiss(toast), duration);
    }
    
    return toast;
  }

  /**
   * Dismiss a toast
   */
  dismiss(toast) {
    if (!toast || !toast.parentNode) return;
    
    toast.classList.remove('toast-show');
    toast.classList.add('toast-hide');
    
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }

  // Convenience methods
  success(message, duration) {
    return this.show(message, 'success', duration);
  }

  error(message, duration) {
    return this.show(message, 'error', duration);
  }

  warning(message, duration) {
    return this.show(message, 'warning', duration);
  }

  info(message, duration) {
    return this.show(message, 'info', duration);
  }
}

// Create global instance
const toast = new Toast();

export { toast };
export default toast;
