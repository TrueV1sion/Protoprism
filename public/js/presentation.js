// NAV PANEL
function toggleNav(){
  const p=document.getElementById('navPanel');
  const o=document.getElementById('navOverlay');
  const b=document.getElementById('navBtn');
  const isOpen=p.classList.contains('open');
  if(isOpen){p.classList.remove('open');o.classList.remove('open');b.innerHTML='&#9776;';}
  else{p.classList.add('open');o.classList.add('open');b.innerHTML='&#10005;';}
}

// SLIDE SNAP NAVIGATION
const slides=document.querySelectorAll('.slide');
const totalSlides=slides.length;
let currentSlide=0;
let counterTimeout;

function updateProgress(){
  const scrollTop=window.scrollY||document.documentElement.scrollTop;
  const docHeight=document.documentElement.scrollHeight-window.innerHeight;
  const pct=docHeight>0?(scrollTop/docHeight)*100:0;
  document.getElementById('slideProgress').style.width=pct+'%';
  // Determine current slide
  let closest=0;
  let minDist=Infinity;
  slides.forEach((s,i)=>{
    const d=Math.abs(s.getBoundingClientRect().top);
    if(d<minDist){minDist=d;closest=i;}
  });
  currentSlide=closest;
  const counter=document.getElementById('slideCounter');
  counter.textContent=String(closest+1).padStart(2,'0')+' / '+String(totalSlides).padStart(2,'0');
  counter.classList.add('visible');
  clearTimeout(counterTimeout);
  counterTimeout=setTimeout(()=>counter.classList.remove('visible'),2000);
}

function goToSlide(idx){
  if(idx<0)idx=0;
  if(idx>=totalSlides)idx=totalSlides-1;
  slides[idx].scrollIntoView({behavior:'smooth',block:'start'});
}

// Keyboard navigation
document.addEventListener('keydown',function(e){
  const navOpen=document.getElementById('navPanel').classList.contains('open');
  if(e.key==='Escape'){if(navOpen)toggleNav();return;}
  if(navOpen)return;
  // Check if user is typing in an input
  if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')return;
  switch(e.key){
    case'ArrowDown':case'PageDown':
      e.preventDefault();goToSlide(currentSlide+1);break;
    case'ArrowUp':case'PageUp':
      e.preventDefault();goToSlide(currentSlide-1);break;
    case' ':
      e.preventDefault();goToSlide(currentSlide+1);break;
    case'Home':
      e.preventDefault();goToSlide(0);break;
    case'End':
      e.preventDefault();goToSlide(totalSlides-1);break;
    case'ArrowRight':
      e.preventDefault();goToSlide(currentSlide+1);break;
    case'ArrowLeft':
      e.preventDefault();goToSlide(currentSlide-1);break;
  }
});

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(a=>{
  a.addEventListener('click',function(e){
    e.preventDefault();
    const t=document.querySelector(this.getAttribute('href'));
    if(t)t.scrollIntoView({behavior:'smooth',block:'start'});
  });
});

// Scroll listener
window.addEventListener('scroll',updateProgress,{passive:true});
window.addEventListener('load',function(){
  updateProgress();
  // Hide hint after 4 seconds
  setTimeout(()=>{document.getElementById('navHint').classList.remove('show');},4000);
});

// ANIMATED COUNTER — animates .stat-number[data-target] from 0 to target
function animateCounter(el) {
  const target = parseInt(el.dataset.target);
  if (isNaN(target)) return;
  const suffix = el.dataset.suffix || '';
  const prefix = el.dataset.prefix || '';
  const start = performance.now();
  const duration = 2000;
  function update(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 4); // ease-out quart
    el.textContent = prefix + Math.round(target * eased).toLocaleString() + suffix;
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// INTERSECTION OBSERVER FOR ANIMATIONS
const animObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    // Trigger if ANY part of the slide is intersecting
    if (entry.isIntersecting) {
      entry.target.querySelectorAll('.anim, .anim-scale, .anim-blur').forEach(el => el.classList.add('visible'));
      entry.target.querySelectorAll('.bar-fill').forEach(bar => {
        setTimeout(() => bar.classList.add('animate'), 300);
      });
      entry.target.querySelectorAll('.bar-chart, .line-chart, .donut-chart, .sparkline').forEach(chart => {
        chart.classList.add('is-visible');
      });
      // Animated counters — fire once per element
      entry.target.querySelectorAll('.stat-number[data-target]').forEach(el => {
        if (!el.dataset.animated) {
          el.dataset.animated = 'true';
          animateCounter(el);
        }
      });
    }
  });
}, { threshold: [0, 0.1, 0.5] });

// AMBIENT PARALLAX DEPTH (Desktop Only)
document.addEventListener('mousemove', (e) => {
  if (window.innerWidth < 768) return;
  const x = (e.clientX / window.innerWidth - 0.5) * 40;
  const y = (e.clientY / window.innerHeight - 0.5) * 40;
  document.querySelectorAll('.slide-bg-glow').forEach(glow => {
    glow.style.translate = `${x}px ${y}px`;
  });
});

// Observe all slides
document.querySelectorAll('.slide').forEach(s => animObserver.observe(s));

// Fallback: force the first slide to be visible immediately
setTimeout(() => {
  const firstSlide = document.querySelector('.slide');
  if (firstSlide) {
    firstSlide.querySelectorAll('.anim').forEach(el => el.classList.add('visible'));
  }
}, 50);
