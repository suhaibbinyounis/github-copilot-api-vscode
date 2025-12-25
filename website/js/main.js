// ========================================
// GitHub Copilot API Gateway - Main JS
// ========================================

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initScrollReveal();
  initCodeCopy();
  initFAQ();
  initTabs();
  initSmoothScroll();
});

// ---------- Navigation ----------
function initNavigation() {
  const nav = document.querySelector('.nav');
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');

  // Scroll effect
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      nav?.classList.add('scrolled');
    } else {
      nav?.classList.remove('scrolled');
    }
  });

  // Mobile toggle
  toggle?.addEventListener('click', () => {
    links?.classList.toggle('active');
    toggle.classList.toggle('active');
  });

  // Close mobile menu on link click
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      links?.classList.remove('active');
      toggle?.classList.remove('active');
    });
  });

  // Active link on scroll
  const sections = document.querySelectorAll('section[id]');
  window.addEventListener('scroll', () => {
    const scrollY = window.pageYOffset;
    sections.forEach(section => {
      const sectionHeight = section.offsetHeight;
      const sectionTop = section.offsetTop - 100;
      const sectionId = section.getAttribute('id');
      const navLink = document.querySelector(`.nav-link[href="#${sectionId}"]`);
      
      if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
        navLink?.classList.add('active');
      } else {
        navLink?.classList.remove('active');
      }
    });
  });
}

// ---------- Scroll Reveal ----------
function initScrollReveal() {
  const reveals = document.querySelectorAll('.reveal');
  
  const revealOnScroll = () => {
    reveals.forEach(el => {
      const windowHeight = window.innerHeight;
      const elementTop = el.getBoundingClientRect().top;
      const revealPoint = 150;
      
      if (elementTop < windowHeight - revealPoint) {
        el.classList.add('visible');
      }
    });
  };
  
  window.addEventListener('scroll', revealOnScroll);
  revealOnScroll(); // Initial check
}

// ---------- Code Copy ----------
function initCodeCopy() {
  document.querySelectorAll('.code-copy').forEach(btn => {
    btn.addEventListener('click', async () => {
      const codeBlock = btn.closest('.code-block');
      const code = codeBlock?.querySelector('pre')?.textContent;
      
      if (code) {
        try {
          await navigator.clipboard.writeText(code);
          const originalText = btn.textContent;
          btn.textContent = 'Copied!';
          btn.style.color = 'var(--color-secondary)';
          
          setTimeout(() => {
            btn.textContent = originalText;
            btn.style.color = '';
          }, 2000);
        } catch (err) {
          console.error('Failed to copy:', err);
        }
      }
    });
  });
}

// ---------- FAQ Accordion ----------
function initFAQ() {
  document.querySelectorAll('.faq-question').forEach(question => {
    question.addEventListener('click', () => {
      const item = question.closest('.faq-item');
      const isActive = item?.classList.contains('active');
      
      // Close all others
      document.querySelectorAll('.faq-item').forEach(i => {
        i.classList.remove('active');
      });
      
      // Toggle current
      if (!isActive) {
        item?.classList.add('active');
      }
    });
  });
}

// ---------- Tabs ----------
function initTabs() {
  document.querySelectorAll('.tabs').forEach(tabContainer => {
    const tabs = tabContainer.querySelectorAll('.tab');
    const parent = tabContainer.parentElement;
    const contents = parent?.querySelectorAll('.tab-content');
    
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        
        // Update tabs
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Update content
        contents?.forEach(content => {
          content.classList.remove('active');
          if (content.dataset.tab === target) {
            content.classList.add('active');
          }
        });
      });
    });
  });
}

// ---------- Smooth Scroll ----------
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
      e.preventDefault();
      const target = document.querySelector(anchor.getAttribute('href'));
      
      if (target) {
        const navHeight = document.querySelector('.nav')?.offsetHeight || 0;
        const targetPosition = target.offsetTop - navHeight - 20;
        
        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
    });
  });
}

// ---------- Utility Functions ----------
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ---------- Search (for docs) ----------
function initSearch() {
  const searchInput = document.querySelector('.docs-search');
  
  searchInput?.addEventListener('input', debounce(e => {
    const query = e.target.value.toLowerCase();
    const items = document.querySelectorAll('.docs-nav-links a');
    
    items.forEach(item => {
      const text = item.textContent?.toLowerCase() || '';
      const parent = item.closest('li');
      
      if (text.includes(query)) {
        parent?.style.setProperty('display', 'block');
      } else {
        parent?.style.setProperty('display', 'none');
      }
    });
  }, 200));
}

// ---------- Endpoint Toggle ----------
function toggleEndpoint(element) {
  const card = element.closest('.endpoint-card');
  card?.classList.toggle('expanded');
}
