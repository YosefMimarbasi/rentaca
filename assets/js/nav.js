(() => {
  const nav = document.querySelector(".nav");
  if (!nav) return;
  const hasHero = !!document.querySelector(".hero");
  const threshold = 60;
  function update() {
    if (hasHero && window.scrollY < threshold) nav.classList.add("nav--transparent");
    else nav.classList.remove("nav--transparent");
  }
  update();
  window.addEventListener("scroll", update, { passive: true });

  const toggle = document.getElementById("themeToggle");
  if (toggle) {
    toggle.addEventListener("click", () => {
      const isDark = document.documentElement.classList.toggle("theme-dark");
      document.documentElement.classList.toggle("sl-theme-dark", isDark);
      localStorage.setItem("theme", isDark ? "dark" : "light");
    });
  }

  // Hero scroll animation — content drifts/fades back, background parallaxes
  // slower, scroll cue disappears as soon as the user takes the hint.
  const hero = document.querySelector(".hero");
  const reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (hero && !reduceMotion) {
    const content = hero.querySelector(".hero__content");
    const bg = hero.querySelector(".hero__bg");
    const cue = hero.querySelector(".hero__scroll");
    let ticking = false;
    function heroParallax() {
      const progress = Math.min(Math.max(window.scrollY / hero.offsetHeight, 0), 1);
      if (content) {
        content.style.setProperty("transform", `translateY(${progress * 70}px)`, "important");
        content.style.setProperty("opacity", String(Math.max(1 - progress * 1.3, 0)), "important");
      }
      if (bg) bg.style.transform = `translateY(${progress * 35}px)`;
      if (cue) cue.style.opacity = String(Math.max(1 - progress * 4, 0));
      ticking = false;
    }
    heroParallax();
    window.addEventListener("scroll", () => {
      if (!ticking) { requestAnimationFrame(heroParallax); ticking = true; }
    }, { passive: true });
  }
})();
