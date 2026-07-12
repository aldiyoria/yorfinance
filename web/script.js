// ===== Navbar scroll effect =====
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 20);
});

// ===== Mobile menu toggle =====
const mobileToggle = document.getElementById('mobileToggle');
const navLinks = document.getElementById('navLinks');

mobileToggle.addEventListener('click', () => {
  navLinks.classList.toggle('active');
});

// Close mobile menu on link click
navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('active');
  });
});

// ===== Scroll animations =====
const animateElements = document.querySelectorAll('.feature-card, .step, .pricing-card, .faq-item, .hero-visual');

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry, index) => {
    if (entry.isIntersecting) {
      setTimeout(() => {
        entry.target.classList.add('visible');
      }, index * 80);
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });

animateElements.forEach(el => {
  el.classList.add('animate');
  observer.observe(el);
});

// ===== Smooth scroll for anchor links =====
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

// ===== Hero screen carousel =====
(function() {
  const screens = document.querySelectorAll('.hero-screen');
  const dots    = document.querySelectorAll('.dot');
  let current   = 0;
  let interval;

  function showScreen(idx) {
    screens.forEach(s => s.classList.remove('active'));
    dots.forEach(d => d.classList.remove('active'));

    // Re-trigger animations by removing and re-adding the class
    const target = screens[idx];
    target.querySelectorAll('.msg-animate').forEach(el => {
      el.style.animation = 'none';
      el.offsetHeight; // trigger reflow
      el.style.animation = '';
    });

    target.classList.add('active');
    dots[idx].classList.add('active');
    current = idx;
  }

  function next() {
    showScreen((current + 1) % screens.length);
  }

  function startAuto() {
    interval = setInterval(next, 4000);
  }

  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => {
      clearInterval(interval);
      showScreen(i);
      startAuto();
    });
  });

  showScreen(0);
  startAuto();
})();
