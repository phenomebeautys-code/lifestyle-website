/* ==============================================
   PhenomeBeauty — script.js
   1. Navbar scroll depth
   2. Mobile menu toggle
   3. Active nav link on scroll
   4. Scroll reveal with force-check on load
   5. Smooth scroll with nav offset
============================================== */

(function () {
    "use strict";

    /* ------------------------------------------
       Refs
    ------------------------------------------ */
    const navbar     = document.getElementById("navbar");
    const menuToggle = document.getElementById("menuToggle");
    const navMenu    = document.getElementById("navMenu");
    const navLinks   = navMenu ? [...navMenu.querySelectorAll("a")] : [];
    const sections   = [...document.querySelectorAll("section[id]")];
    const revealEls  = [...document.querySelectorAll(".reveal")];
    const navbarInner = navbar ? navbar.querySelector(".navbar-inner") : null;

    /* ------------------------------------------
       1. Navbar scroll depth
    ------------------------------------------ */
    function updateNavbar() {
        if (!navbar || !navbarInner) return;
        const depth = Math.min(window.scrollY / 180, 1);
        const alpha = 0.72 + depth * 0.22;
        navbarInner.style.background = `linear-gradient(
            135deg,
            rgba(28, 28, 30, ${alpha}),
            rgba(16, 16, 18, ${(alpha - 0.14).toFixed(2)})
        )`;
    }

    window.addEventListener("scroll", updateNavbar, { passive: true });
    updateNavbar();

    /* ------------------------------------------
       2. Mobile menu toggle
    ------------------------------------------ */
    function closeMenu() {
        if (!navbar) return;
        navbar.classList.remove("menu-open");
        if (menuToggle) {
            menuToggle.setAttribute("aria-expanded", "false");
            const [s1, , s3] = menuToggle.querySelectorAll("span");
            menuToggle.querySelectorAll("span").forEach((s, i) => {
                s.style.transform = "";
                s.style.opacity   = "";
            });
        }
    }

    function openMenu() {
        if (!navbar) return;
        navbar.classList.add("menu-open");
        if (menuToggle) {
            menuToggle.setAttribute("aria-expanded", "true");
            const spans = [...menuToggle.querySelectorAll("span")];
            spans[0].style.transform = "translateY(7px) rotate(45deg)";
            spans[1].style.opacity   = "0";
            spans[2].style.transform = "translateY(-7px) rotate(-45deg)";
        }
    }

    if (menuToggle) {
        menuToggle.addEventListener("click", (e) => {
            e.stopPropagation();
            navbar.classList.contains("menu-open") ? closeMenu() : openMenu();
        });
    }

    // Close on outside click
    document.addEventListener("click", (e) => {
        if (navbar && navbar.classList.contains("menu-open")) {
            if (!navbar.contains(e.target)) closeMenu();
        }
    });

    // Close on link click
    navLinks.forEach((link) => link.addEventListener("click", closeMenu));

    /* ------------------------------------------
       3. Active nav on scroll
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
        { rootMargin: "-30% 0px -60% 0px", threshold: 0 }
    );

    sections.forEach((sec) => sectionObserver.observe(sec));

    /* ------------------------------------------
       4. Scroll reveal
    ------------------------------------------ */
    function forceRevealInView() {
        revealEls.forEach((el) => {
            const rect = el.getBoundingClientRect();
            if (rect.top < window.innerHeight + 40) {
                el.classList.add("is-visible");
            }
        });
    }

    if ("IntersectionObserver" in window) {
        const revealObserver = new IntersectionObserver(
            (entries, obs) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;

                    // stagger cards within the same parent
                    const siblings = [
                        ...entry.target.parentElement.querySelectorAll(
                            ".reveal:not(.is-visible)"
                        ),
                    ];
                    const idx   = siblings.indexOf(entry.target);
                    const delay = idx >= 0 ? idx * 90 : 0;

                    setTimeout(() => {
                        entry.target.classList.add("is-visible");
                    }, delay);

                    obs.unobserve(entry.target);
                });
            },
            { rootMargin: "0px 0px -30px 0px", threshold: 0 }
        );

        revealEls.forEach((el) => revealObserver.observe(el));
    } else {
        revealEls.forEach((el) => el.classList.add("is-visible"));
    }

    // Force-reveal everything already in view on load
    setTimeout(forceRevealInView, 80);
    window.addEventListener("load", forceRevealInView);

    /* ------------------------------------------
       5. Smooth scroll with nav offset
    ------------------------------------------ */
    navLinks.forEach((link) => {
        link.addEventListener("click", (e) => {
            const href = link.getAttribute("href");
            if (!href || !href.startsWith("#")) return;
            const target = document.querySelector(href);
            if (!target) return;
            e.preventDefault();
            const navH = navbar ? navbar.offsetHeight + 16 : 0;
            const top  = target.getBoundingClientRect().top + window.scrollY - navH;
            window.scrollTo({ top, behavior: "smooth" });
        });
    });

})();
