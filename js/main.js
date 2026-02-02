/**
 * techieman.os — Main script
 * Handles the text hover effect: black dot that follows the cursor and is
 * visible only inside the "Welcome to techieman.os" text (via SVG mask).
 */

(function () {
  "use strict";

  var hero = document.getElementById("hero");
  var heroSvg = document.getElementById("hero-svg");
  var dot = document.getElementById("cursor-dot");

  if (!hero || !heroSvg || !dot) return;

  var dotRadius = 24;
  var targetX = -100;
  var targetY = -100;
  var currentX = -100;
  var currentY = -100;
  var isInside = false;
  var rafId = null;
  var easing = 0.18;

  /**
   * Map client (window) coordinates to SVG viewBox coordinates.
   * Uses getScreenCTM().inverse() so the dot position matches the cursor.
   */
  function clientToSvg(svg, clientX, clientY) {
    var pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    var ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    var inverted = ctm.inverse();
    var ptTransformed = pt.matrixTransform(inverted);
    return { x: ptTransformed.x, y: ptTransformed.y };
  }

  /**
   * Update dot position with smooth follow (lerp) for 60fps feel.
   * Dot is only visible inside text because of SVG mask in HTML.
   */
  function tick() {
    currentX += (targetX - currentX) * easing;
    currentY += (targetY - currentY) * easing;
    dot.setAttribute("cx", currentX);
    dot.setAttribute("cy", currentY);

    if (isInside) {
      rafId = requestAnimationFrame(tick);
    }
  }

  function startFollow() {
    if (rafId !== null) return;
    isInside = true;
    dot.classList.remove("hidden");
    rafId = requestAnimationFrame(tick);
  }

  function stopFollow() {
    isInside = false;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    dot.classList.add("hidden");
    targetX = -100;
    targetY = -100;
  }

  function onMouseMove(e) {
    var pt = clientToSvg(heroSvg, e.clientX, e.clientY);
    targetX = pt.x;
    targetY = pt.y;
  }

  hero.addEventListener("mouseenter", function () {
    startFollow();
  });

  hero.addEventListener("mouseleave", function () {
    stopFollow();
  });

  hero.addEventListener("mousemove", onMouseMove, { passive: true });
})();
