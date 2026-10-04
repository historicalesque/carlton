/* Banner parallax
   -----------------
   The banner starts cropped to the bottom third of the source image
   (set in CSS via --banner-shift: 0%). As the page scrolls down, this
   nudges --banner-shift up, which slides the visible crop upward
   through the image — more slowly than the page itself scrolls, for
   a parallax feel. Fully optional: with JS disabled the banner just
   stays on its bottom-third rest crop. */
(function () {
    var banner = document.querySelector('.banner-image');
    if (!banner) return;

    // How far the crop can travel, and over what scroll distance.
    var MAX_SHIFT = 55;      // percent — how far up the image we can reveal
    var SCROLL_RANGE = 900;  // px of page scroll over which the full shift happens

    var ticking = false;

    function update() {
        var progress = Math.min(Math.max(window.scrollY / SCROLL_RANGE, 0), 1);
        banner.style.setProperty('--banner-shift', (progress * MAX_SHIFT) + '%');
        ticking = false;
    }

    function onScroll() {
        if (!ticking) {
            window.requestAnimationFrame(update);
            ticking = true;
        }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    update();
})();
