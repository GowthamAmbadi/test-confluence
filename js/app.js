/* ============================================================
   CONFLUENCE 2026 — app.js (shared)
   ============================================================ */

// ─── NAVBAR ───
function initNav() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled', 'expanded');
    }
  });

  navbar.addEventListener('click', (e) => {
    if (navbar.classList.contains('scrolled') && !navbar.classList.contains('expanded')) {
      navbar.classList.add('expanded');
      e.stopPropagation();
    }
  });

  document.addEventListener('click', () => navbar.classList.remove('expanded'));
  navbar.addEventListener('click', (e) => e.stopPropagation());
}

// ─── MOBILE MENU ───
function initMobileMenu() {
  const toggle = document.getElementById('mobile-toggle');
  const menu = document.getElementById('mobile-menu');
  if (!toggle || !menu) return;

  toggle.addEventListener('click', () => {
    const active = toggle.classList.toggle('active');
    menu.classList.toggle('active');
    document.body.style.overflow = active ? 'hidden' : '';
  });

  menu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', (e) => {
      if (link.classList.contains('mobile-dropdown-trigger')) {
        e.preventDefault();
        e.stopPropagation();
        const wrapper = link.closest('.mobile-dropdown-wrapper');
        if (wrapper) {
          wrapper.classList.toggle('active');
        }
        return;
      }
      toggle.classList.remove('active');
      menu.classList.remove('active');
      document.body.style.overflow = '';
    });
  });
}

// ─── SCROLL REVEAL ───
function initReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        e.target.querySelectorAll('.reveal-child').forEach((child, i) => {
          setTimeout(() => child.classList.add('visible'), i * 80);
        });
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal, .reveal-parent').forEach(el => observer.observe(el));
}

// ─── CART COUNT BADGE ───
function updateCartBadge() {
  const badges = document.querySelectorAll('.cart-count');
  const cart = JSON.parse(localStorage.getItem('confluenceCart') || '[]');
  const count = cart.reduce((sum, item) => sum + (item.qty || 1), 0);
  badges.forEach(b => {
    b.textContent = count;
    b.style.display = count > 0 ? 'flex' : 'none';
  });
}

// ─── INIT ───
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initMobileMenu();
  initReveal();
  updateCartBadge();
});
