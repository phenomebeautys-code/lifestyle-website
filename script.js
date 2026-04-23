/* ==============================================
   PhenomeBeauty — script.js
   Handles:
     1. Navbar scroll shrink + background shift
     2. Mobile menu toggle
     3. Nav link active state on scroll (IntersectionObserver)
     4. Scroll reveal (.reveal → .is-visible)
     5. Smooth close of mobile menu on link click
     6. Pill nav: close on outside click
============================================== */

(function () {
  "use strict";

  /* ------------------------------------------
     1. Element refs
  ------------------------------------------ */
  const navbar      = document.getElementById("navbar");
  const menuToggle  = document.getElementById("menuToggle");
  const navMenu     = document.getElementById("navMenu");
  const navLinks    = navMenu ? [...navMenu.querySelectorAll("a")] : [];
  const sections    = [...document.querySelectorAll("section[id]")];
  const revealEls   = [...document.querySelectorAll(".reveal")];

  /* ------------------------------------------
     2. Navbar — scroll shrink
  ------------------------------------------ */
  function onScroll() {
    if (!navbar) return;
    if (window.scrollY > 40) {
      navbar.classList.add("scrolled");
    } else {
      navbar.classList.remove("scrolled");
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll(); // run once on load

  /* ------------------------------------------
     3. Mobile menu toggle
  ------------------------------------------ */
  if (menuToggle && navbar) {
    menuToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = navbar.classList.toggle("menu-open");
      menuToggle.setAttribute("aria-expanded", String(isOpen));

      // animate hamburger → X
      const spans = menuToggle.querySelectorAll("span");
      if (isOpen) {
        spans[0].style.transform = "translateY(7px) rotate(45deg)";
        spans[1].style.opacity   = "0";
        spans[2].style.transform = "translateY(-7px) rotate(-45deg)";
      } else {
        spans[0].style.transform = "";
        spans[1].style.opacity   = "";
        spans[2].style.transform = "";
      }
    });
  }

  // Close on outside click
  document.addEventListener("click", (e) => {
    if (navbar && navbar.classList.contains("menu-open")) {
      if (!navbar.contains(e.target)) {
        closeMenu();
      }
    }
  });

  // Close on nav link click
  navLinks.forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  function closeMenu() {
    if (!navbar) return;
    navbar.classList.remove("menu-open");
    if (menuToggle) {
      menuToggle.setAttribute("aria-expanded", "false");
      const spans = menuToggle.querySelectorAll("span");
      spans[0].style.transform = "";
      spans[1].style.opacity   = "";
      spans[2].style.transform = "";
    }
  }

  /* ------------------------------------------
     4. Active nav link on scroll
  ------------------------------------------ */
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.getAttribute("id");
          navLinks.forEach((link) => {
            link.classList.toggle(
              "active",
              link.getAttribute("href") === `#${id}`
            );
          });
        }
      });
    },
    {
      rootMargin: "-30% 0px -60% 0px",
      threshold: 0,
    }
  );

  sections.forEach((sec) => sectionObserver.observe(sec));

  /* ------------------------------------------
     5. Scroll reveal
  ------------------------------------------ */
  if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry, i) => {
          if (entry.isIntersecting) {
            // stagger siblings inside the same parent
            const siblings = [
              ...entry.target.parentElement.querySelectorAll(".reveal:not(.is-visible)"),
            ];
            const delay = siblings.indexOf(entry.target) * 80;

            setTimeout(() => {
              entry.target.classList.add("is-visible");
            }, delay);

            obs.unobserve(entry.target);
          }
        });
      },
      {
        rootMargin: "0px 0px -60px 0px",
        threshold: 0.08,
      }
    );

    revealEls.forEach((el) => revealObserver.observe(el));
  } else {
    // Fallback: just show everything
    revealEls.forEach((el) => el.classList.add("is-visible"));
  }

  /* ------------------------------------------
     6. Navbar scrolled style tweak
        (adds backdrop-filter strength increase)
  ------------------------------------------ */
  const navbarInner = navbar ? navbar.querySelector(".navbar-inner") : null;

  function updateNavbarDepth() {
    if (!navbarInner) return;
    const depth = Math.min(window.scrollY / 200, 1);
    const alpha = 0.7 + depth * 0.2;
    navbarInner.style.background = `linear-gradient(
      135deg,
      rgba(28, 28, 30, ${alpha}),
      rgba(18, 18, 20, ${alpha - 0.14})
    )`;
  }

  window.addEventListener("scroll", updateNavbarDepth, { passive: true });
  updateNavbarDepth();

  /* ------------------------------------------
     7. Smooth scroll polyfill for older Safari
  ------------------------------------------ */
  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      const href = link.getAttribute("href");
      if (href && href.startsWith("#")) {
        const target = document.querySelector(href);
        if (target) {
          e.preventDefault();
          const navH = navbar ? navbar.offsetHeight : 0;
          const top  = target.getBoundingClientRect().top + window.scrollY - navH - 16;
          window.scrollTo({ top, behavior: "smooth" });
        }
      }
    });
  });

})();
