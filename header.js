// Smart header: hide nav on scroll down, show on scroll up.
// Global, progressive enhancement — works with the fixed nav in base.css.
(function () {
    var HIDE_AFTER = 100; // px: never hide at the very top
    var TOLERANCE = 8; // px: ignore tiny jitter / trackpad noise
    var COOLDOWN_MS = 800; // after load: stay visible (covers liga jumpToNearest)

    var nav = null;
    var lastY = 0;
    var ticking = false;
    var suppressHideUntil = Date.now() + COOLDOWN_MS;

    function measure() {
        nav = nav || document.querySelector('header#header nav') || document.querySelector('nav');
        if (!nav) return;
        var h = Math.round(nav.getBoundingClientRect().height);
        if (h > 0) {
            document.documentElement.style.setProperty('--nav-h', h + 'px');
        }
    }

    function modalOpen() {
        return !!document.querySelector('.modal.active');
    }

    function show() {
        if (document.body.classList.contains('nav-hidden')) {
            document.body.classList.remove('nav-hidden');
        }
    }

    function hide() {
        if (!document.body.classList.contains('nav-hidden')) {
            document.body.classList.add('nav-hidden');
        }
    }

    function update() {
        ticking = false;
        var y = window.scrollY || window.pageYOffset || 0;
        var dy = y - lastY;

        // tiny movements: keep state, but sync lastY so they don't accumulate
        if (Math.abs(dy) < TOLERANCE) return;
        lastY = y;

        // at the top: always visible
        if (y <= HIDE_AFTER) {
            show();
            return;
        }

        // during cooldown (initial auto-jump) or with a modal open: may show, never hide
        if (Date.now() < suppressHideUntil || modalOpen()) {
            if (dy < 0) show();
            return;
        }

        if (dy > 0) hide();
        else show();
    }

    function onScroll() {
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(update);
        }
    }

    // allow pages with programmatic jumps (liga switchView/jumpToNearest) to keep nav visible briefly
    window.__keepNavVisibleBriefly = function (ms) {
        suppressHideUntil = Date.now() + (ms == null ? COOLDOWN_MS : ms);
        show();
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);
    document.addEventListener('DOMContentLoaded', function () {
        lastY = window.scrollY || 0;
        measure();
    });
    // classic (non-deferred) script may run before body exists — retry once on load
    window.addEventListener('load', measure);
    measure();
})();
