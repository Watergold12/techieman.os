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
  /**
   * App windows (OS-style): multi-window, focus, and stacking.
   */
  (function () {
    var globalZIndex = 100; // Starting z-index for windows
    var isAnimating = false; // Prevents rapid-fire animation glitches

    function getWindowEl(appId) {
      return document.getElementById("app-" + appId);
    }

    /**
     * Brings the specified window to the front.
     * Updates z-index and adds .is-focused class.
     */
    function focusWindow(win) {
      if (!win) return;
      globalZIndex++;
      win.style.zIndex = globalZIndex;

      // Update classes for all windows
      var allWindows = document.querySelectorAll(".app-window");
      allWindows.forEach(function (w) {
        if (w === win) {
          w.classList.add("is-focused");
          w.setAttribute("aria-current", "page"); // Accessibility hint
        } else {
          w.classList.remove("is-focused");
          w.removeAttribute("aria-current");
        }
      });
    }

    function openApp(appId) {
      var win = getWindowEl(appId);
      if (!win) return;
      
      // If already open, just focus it
      if (win.style.display === "block" && win.classList.contains("is-open")) {
        focusWindow(win);
        return;
      }

      if (isAnimating) return;
      isAnimating = true;

      // Bring to front immediately before showing
      focusWindow(win);
      
      win.style.display = "block";
      win.setAttribute("aria-hidden", "false");

      // Launch logic: next frame add .is-open so CSS transition runs.
      requestAnimationFrame(function () {
        win.classList.add("is-open");
        window.setTimeout(function () {
          isAnimating = false;
        }, 240); // match CSS transition duration
      });
    }

    function closeApp(appId) {
      var win = getWindowEl(appId);
      if (!win) return;
      if (isAnimating) return; // Optional: could allow closing during anim if careful
      if (win.style.display !== "block") return;

      isAnimating = true;
      win.classList.remove("is-open");
      win.classList.remove("is-focused");

      var onDone = function (ev) {
        if (ev.target !== win) return;
        win.removeEventListener("transitionend", onDone);
        win.style.display = "none";
        win.setAttribute("aria-hidden", "true");
        isAnimating = false;
      };
      win.addEventListener("transitionend", onDone);
    }

    // ----------------------------------------------------------------------
    // Dragging Logic
    // ----------------------------------------------------------------------
    var dragWin = null;
    var dragOffsetX = 0;
    var dragOffsetY = 0;

    function onDragMove(e) {
      if (!dragWin) return;
      e.preventDefault(); // Stop text selection/scrolling during drag

      // Calculate new center position based on mouse position - offset
      var newX = e.clientX - dragOffsetX;
      var newY = e.clientY - dragOffsetY;

      // Constraints (Viewport Bounds)
      // Keep the window mostly on screen.
      // We are manipulating the center (left/top are center because of translate(-50%, -50%)).
      var rect = dragWin.getBoundingClientRect();
      var halfW = rect.width / 2;
      var halfH = rect.height / 2;
      
      var minX = halfW; // Keep left edge at 0
      var maxX = window.innerWidth - halfW; // Keep right edge at viewportWidth
      var minY = halfH; // Keep top edge at 0 (or under top bar)
      var maxY = window.innerHeight - halfH - 40; // Keep some of it visible at bottom

      // Apply constraints
      if (newX < minX) newX = minX;
      if (newX > maxX) newX = maxX;
      if (newY < minY) newY = minY;
      if (newY > maxY) newY = maxY;

      dragWin.style.left = newX + "px";
      dragWin.style.top = newY + "px";
    }

    function onDragEnd() {
      if (dragWin) {
        dragWin = null;
        document.documentElement.style.cursor = ""; // Reset global cursor
        window.removeEventListener("mousemove", onDragMove);
        window.removeEventListener("mouseup", onDragEnd);
      }
    }

    // Attach click listener to ALL windows for focus handling AND dragging
    // We use a delegated listener on document body for simplicity
    document.addEventListener("mousedown", function(e) {
      var win = e.target.closest(".app-window");
      if (!win) return;

      // 1. Always bring to front on click
      if (!win.classList.contains("is-focused")) {
        focusWindow(win);
      }

      // 2. Check for Title Bar Drag Start
      var titleBar = e.target.closest(".app-window__titlebar");
      // Ensure we didn't click the close button or other controls
      if (titleBar && !e.target.closest("button")) {
        e.preventDefault();
        
        dragWin = win;
        
        // Calculate the offset of the mouse from the Center of the window
        // (Since left/top define the center due to CSS transform)
        var rect = win.getBoundingClientRect();
        var centerX = rect.left + rect.width / 2;
        var centerY = rect.top + rect.height / 2;

        dragOffsetX = e.clientX - centerX;
        dragOffsetY = e.clientY - centerY;

        // Attach global listeners for move/up
        document.documentElement.style.cursor = "move"; // Feedback
        window.addEventListener("mousemove", onDragMove, { passive: false });
        // Use the same function reference for cleanup
        window.addEventListener("mouseup", onDragEnd);
      }
    });

    // Delegated listener for dock launches and generic close buttons
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
    // ----------------------------------------------------------------------
    // Terminal Logic (Fake Shell)
    // ----------------------------------------------------------------------
    // ----------------------------------------------------------------------
    // Terminal Logic (Fake Shell)
    // ----------------------------------------------------------------------
    (function initTerminal() {
      var termInput = document.getElementById("terminal-input");
      var termOutput = document.getElementById("terminal-output");
      if (!termInput || !termOutput) return;

      var history = [];
      var historyIndex = -1;

      function printLine(text, type) {
        var div = document.createElement("div");
        div.className = "terminal-line " + (type || "");
        div.textContent = text;
        termOutput.appendChild(div);
        termOutput.scrollTop = termOutput.scrollHeight;
      }

      function executeCommand(input) {
        var clean = input.trim();
        if (!clean) return;

        // Visual: echo command
        printLine("techieman@os:~$ " + clean);
        
        // History management
        if (history[history.length - 1] !== clean) {
          history.push(clean);
        }
        historyIndex = history.length;

        // Parsing: simple space split
        var parts = clean.split(/\s+/);
        var cmd = parts[0].toLowerCase();
        var arg = parts.slice(1).join(" ").toLowerCase();

        switch (cmd) {
          case "help":
            printLine("Available commands:", "system");
            printLine("  open [app]   - Launch an app (about, projects, contact)");
            printLine("  date         - Show current date/time");
            printLine("  whoami       - Display user info");
            printLine("  clear        - Clear terminal output");
            printLine("  help         - Show this list");
            break;

          case "clear":
            termOutput.innerHTML = "";
            break;

          case "date":
            printLine(new Date().toLocaleString());
            break;

          case "whoami":
            printLine("visitor@techieman.os");
            break;

          case "open":
            if (!arg) {
              printLine("Error: Missing app name. Usage: open [app]", "error");
            } else {
              var targetId = "app-" + arg;
              var targetEl = document.getElementById(targetId);
              if (targetEl) {
                printLine("Launching " + arg + "...", "system");
                // IMPORTANT: ensure openApp is accessible in this scope
                // It is, because initTerminal is inside the main IIFE where openApp is defined.
                openApp(arg);
              } else {
                printLine("Error: App '" + arg + "' not found.", "error");
              }
            }
            break;

          default:
            printLine("Command not found: " + cmd + ". Type 'help'.", "error");
        }
      }

      // Event Listener: Keydown
      termInput.addEventListener("keydown", function(e) {
        if (e.key === "Enter") {
          e.preventDefault();
          var val = termInput.value;
          executeCommand(val);
          termInput.value = "";
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          if (historyIndex > 0) {
            historyIndex--;
            termInput.value = history[historyIndex];
          }
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          if (historyIndex < history.length - 1) {
            historyIndex++;
            termInput.value = history[historyIndex];
          } else {
            historyIndex = history.length;
            termInput.value = "";
          }
        }
      });
      
      // Auto-focus input when clicking anywhere in the terminal window
      var termWin = document.getElementById("app-terminal");
      if (termWin) {
        termWin.addEventListener("click", function() {
           termInput.focus();
        });
      }
    })();
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
