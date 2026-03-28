/* ═══════════════════════════════════════════════
   LidaMixPlay Landing Page — app.js
   Scroll animations, particles, tabs, counters
═══════════════════════════════════════════════ */

'use strict';

// ── Scroll-triggered reveal ───────────────────
const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
            // Stagger siblings slightly
            const siblings = entry.target.parentElement?.querySelectorAll('.reveal');
            let delay = 0;
            if (siblings) {
                [...siblings].forEach((el, idx) => {
                    if (el === entry.target) delay = Math.min(idx * 80, 400);
                });
            }
            setTimeout(() => entry.target.classList.add('visible'), delay);
            revealObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

// ── Sticky nav ────────────────────────────────
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 40);
}, { passive: true });

// ── Mobile nav burger ─────────────────────────
const burger  = document.getElementById('navBurger');
const navMob  = document.getElementById('navMobile');
burger?.addEventListener('click', () => {
    navMob.classList.toggle('open');
    burger.classList.toggle('open');
});
navMob?.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
        navMob.classList.remove('open');
        burger.classList.remove('open');
    });
});

// ── Animated stat counters ────────────────────
function animateCounter(el) {
    const target = parseInt(el.dataset.count || '0', 10);
    const suffix = el.dataset.suffix || '';
    const duration = 1600;
    const start = performance.now();

    const tick = (now) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(eased * target);
        el.textContent = current.toLocaleString() + suffix;
        if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            animateCounter(entry.target);
            counterObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.5 });

document.querySelectorAll('.stat-number').forEach(el => counterObserver.observe(el));

// ── Screenshot tabs ───────────────────────────
const tabBtns  = document.querySelectorAll('.tab-btn');
const tabSlides = document.querySelectorAll('.screenshot-slide');

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const idx = btn.dataset.tab;
        tabBtns.forEach(b => b.classList.remove('active'));
        tabSlides.forEach(s => s.classList.remove('active'));
        btn.classList.add('active');
        const slide = document.querySelector(`.screenshot-slide[data-slide="${idx}"]`);
        if (slide) {
            slide.classList.add('active');
            // Re-trigger reveal on the frame inside
            slide.querySelectorAll('.reveal').forEach(el => {
                el.classList.remove('visible');
                setTimeout(() => el.classList.add('visible'), 50);
            });
        }
    });
});

// ── Hero particle canvas ──────────────────────
(function initParticles() {
    const canvas = document.getElementById('heroParticles');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let W, H, particles = [];

    const COLORS = ['rgba(155,93,229,', 'rgba(34,211,238,', 'rgba(244,114,182,', 'rgba(96,165,250,'];

    function resize() {
        W = canvas.width  = canvas.offsetWidth;
        H = canvas.height = canvas.offsetHeight;
    }

    function createParticle() {
        return {
            x: Math.random() * W,
            y: Math.random() * H,
            r: Math.random() * 1.8 + 0.3,
            alpha: Math.random() * 0.5 + 0.1,
            speed: Math.random() * 0.3 + 0.05,
            drift: (Math.random() - 0.5) * 0.3,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
        };
    }

    function init() {
        resize();
        particles = Array.from({ length: 120 }, createParticle);
    }

    function draw() {
        ctx.clearRect(0, 0, W, H);
        particles.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = p.color + p.alpha + ')';
            ctx.fill();

            p.y -= p.speed;
            p.x += p.drift;
            p.alpha -= 0.0008;

            if (p.y < -5 || p.alpha <= 0) {
                Object.assign(p, createParticle(), { y: H + 5, alpha: Math.random() * 0.5 + 0.1 });
            }
        });
        requestAnimationFrame(draw);
    }

    window.addEventListener('resize', () => { resize(); }, { passive: true });
    init();
    draw();
})();

// ── Smooth active nav link highlight ─────────
const sections = document.querySelectorAll('section[id]');
const navLinkEls = document.querySelectorAll('.nav-links a');

const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const id = entry.target.id;
            navLinkEls.forEach(a => {
                a.style.color = a.getAttribute('href') === `#${id}` ? '#f0f4ff' : '';
            });
        }
    });
}, { threshold: 0.4 });

sections.forEach(s => sectionObserver.observe(s));

// ── Parallax on hero orbs ─────────────────────
window.addEventListener('scroll', () => {
    const y = window.scrollY;
    document.querySelectorAll('.hero-orb').forEach((orb, i) => {
        const speed = [0.12, 0.08, 0.15][i] || 0.1;
        orb.style.transform = `translateY(${y * speed}px)`;
    });
}, { passive: true });
