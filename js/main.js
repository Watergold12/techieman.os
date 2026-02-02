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

  /**
   * Top bar oval pause/resume (mousemove / idle).
   * Requirements:
   * - RUNNING by default (no `html.user-active` class present)
   * - mousemove: pause immediately
   * - stop moving: resume after EXACTLY 3000ms
   * - movement during the 3s window resets the timer
   * - single timeout only, never multiple timers
   * - one event listener, no polling/intervals
   */
  (function () {
    var root = document.documentElement;
    var idleTimeout = null; // single timeout variable (required)
    var isIdle = true; // true => animation running; false => paused due to activity

    // Ensure default is running.
    root.classList.remove("user-active");

    function onAnyMouseMove() {
      // Pause immediately on first movement after idle.
      if (isIdle) {
        isIdle = false;
        root.classList.add("user-active");
      }

      // Reset the single idle timer on every mousemove.
      if (idleTimeout !== null) {
        window.clearTimeout(idleTimeout);
        idleTimeout = null;
      }

      idleTimeout = window.setTimeout(function () {
        // Resume after EXACTLY 3 seconds with no mousemove.
        root.classList.remove("user-active");
        isIdle = true;
        idleTimeout = null;
      }, 3000);
    }

    // Attach exactly one listener (required).
    window.addEventListener("mousemove", onAnyMouseMove, { passive: true });
  })();

  /**
   * System clock (GNOME-style): HH:MM (24h) + hover date.
   * - Updates immediately on load.
   * - Updates exactly on minute boundaries (no per-second ticking).
   * - Uses ONE timer only (single recursive setTimeout) to avoid drift.
   *
   * Formatting:
   * - Time: HH:MM with leading zeros (e.g. 09:05)
   * - Date: "Mon 17 Oct"
   */
  (function () {
    var timeEl = document.getElementById("system-clock-time");
    var dateEl = document.getElementById("system-clock-date");
    if (!timeEl || !dateEl) return;

    var clockTimer = null; // single timer only

    function pad2(n) {
      return n < 10 ? "0" + n : String(n);
    }

    function formatDate(d) {
      var weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return weekdays[d.getDay()] + " " + pad2(d.getDate()) + " " + months[d.getMonth()];
    }

    function renderNow() {
      var now = new Date();
      // Time: HH:MM (24-hour) with leading zeros.
      timeEl.textContent = pad2(now.getHours()) + ":" + pad2(now.getMinutes());
      // Date: Mon 17 Oct (pre-rendered so hover is instant).
      dateEl.textContent = formatDate(now);
    }

    function scheduleNextMinute() {
      // Clear any existing timeout (guarantee single timer).
      if (clockTimer !== null) {
        window.clearTimeout(clockTimer);
        clockTimer = null;
      }

      var now = new Date();
      // Sync to system minute boundary to avoid drift.
      var msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
      if (msUntilNextMinute < 0) msUntilNextMinute = 0;

      clockTimer = window.setTimeout(function () {
        renderNow();
        scheduleNextMinute();
      }, msUntilNextMinute);
    }

    renderNow();
    scheduleNextMinute();
  })();

  /**
   * App windows (OS-style): generic open/close by app id.
   *
   * Mapping:
   * - Dock icons:  data-launch-app="about|projects|..."
   * - Windows:     id="app-about", id="app-projects", ...
   * - Close btn:   data-app-close="about|projects|..."
   *
   * Behavior:
   * - Only ONE app window visible at a time (opening a new one closes current).
   * - Reuses existing CSS transition (opacity/scale/blur, 200ms).
   */
  (function () {
    var currentAppId = null;
    var isAnimating = false;

    function getWindowEl(appId) {
      return document.getElementById("app-" + appId);
    }

    function openApp(appId) {
      var win = getWindowEl(appId);
      if (!win) return;
      if (isAnimating) return;
      if (currentAppId === appId && win.style.display === "block" && win.classList.contains("is-open")) return;

      // If another app is open, close it first, then open the requested one.
      if (currentAppId && currentAppId !== appId) {
        closeApp(currentAppId, function () {
          openApp(appId);
        });
        return;
      }

      isAnimating = true;
      currentAppId = appId;
      win.style.display = "block";
      win.setAttribute("aria-hidden", "false");

      // Launch logic: next frame add .is-open so CSS transition runs.
      requestAnimationFrame(function () {
        win.classList.add("is-open");
        window.setTimeout(function () {
          isAnimating = false;
        }, 240); // keep existing timing (200ms + small buffer)
      });
    }

    function closeApp(appId, done) {
      var win = getWindowEl(appId);
      if (!win) return;
      if (isAnimating) return;
      if (win.style.display !== "block") {
        if (typeof done === "function") done();
        return;
      }

      isAnimating = true;
      win.classList.remove("is-open");

      // After the close transition completes, fully hide the window.
      var onDone = function (ev) {
        if (ev.target !== win) return;
        win.removeEventListener("transitionend", onDone);
        win.style.display = "none";
        win.setAttribute("aria-hidden", "true");
        if (currentAppId === appId) currentAppId = null;
        isAnimating = false;
        if (typeof done === "function") done();
      };
      win.addEventListener("transitionend", onDone);
    }

    // Single delegated listener for dock launches (no per-app JS duplication).
    document.addEventListener("click", function (e) {
      var launch = e.target.closest("[data-launch-app]");
      if (launch) {
        e.preventDefault();
        openApp(launch.getAttribute("data-launch-app"));
        return;
      }
      var closeBtn = e.target.closest("[data-app-close]");
      if (closeBtn) {
        closeApp(closeBtn.getAttribute("data-app-close"));
      }
    });
  })();

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

  if (hero && heroSvg && dot) {
    hero.addEventListener("mouseenter", function () {
      startFollow();
    });

    hero.addEventListener("mouseleave", function () {
      stopFollow();
    });

    hero.addEventListener("mousemove", onMouseMove, { passive: true });
  }
})();
