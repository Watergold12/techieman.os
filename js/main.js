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
    var currentAppId = null; // Focused app
    var isAnimating = false;
    var runningApps = new Set();
    var windowZ = 100;
    const STACK_OFFSET = 20;

    function updateIndicators() {
      document.querySelectorAll("[data-launch-app]").forEach(function (icon) {
        var appId = icon.getAttribute("data-launch-app");
        var indicator = icon.querySelector(".dock-indicator");
        if (!indicator) return;

        indicator.classList.remove("dock-indicator-dot", "dock-indicator-line");

        if (currentAppId === appId) {
          indicator.classList.add("dock-indicator-line");
        } else if (runningApps.has(appId)) {
          indicator.classList.add("dock-indicator-dot");
        }
      });
    }

    function focusWindow(appId) {
      // Remove focus from all windows
      document.querySelectorAll(".app-window").forEach(function (win) {
        win.classList.remove("is-focused");
      });

      if (!appId) {
        currentAppId = null;
        updateIndicators();
        return;
      }
      var win = getWindowEl(appId);
      if (!win) return;

      windowZ++;
      win.style.zIndex = windowZ;
      win.classList.add("is-focused");
      currentAppId = appId;
      updateIndicators();
    }

    function minimizeApp(appId) {
      var win = getWindowEl(appId);
      if (!win) return;
      win.classList.remove("is-open", "is-focused");
      win.classList.add("is-minimized");
      win.style.display = "none";
      win.setAttribute("aria-hidden", "true");
      setNextFocus();
    }

    function restoreApp(appId) {
      var win = getWindowEl(appId);
      if (!win) return;
      win.classList.remove("is-minimized");
      win.style.display = "block";
      win.setAttribute("aria-hidden", "false");

      requestAnimationFrame(function () {
        win.classList.add("is-open");
        focusWindow(appId);
      });
    }

    function setNextFocus() {
      var windows = Array.from(document.querySelectorAll(".app-window.is-open"));
      if (windows.length === 0) {
        focusWindow(null);
        return;
      }

      // Sort by z-index descending
      windows.sort(function (a, b) {
        return parseInt(window.getComputedStyle(b).zIndex) - parseInt(window.getComputedStyle(a).zIndex);
      });

      var highest = windows[0];
      var id = highest.id.replace("app-", "");
      focusWindow(id);
    }

    function getWindowEl(appId) {
      return document.getElementById("app-" + appId);
    }

    function openApp(appId) {
      var win = getWindowEl(appId);
      if (!win) return;
      if (isAnimating) return;

      isAnimating = true;
      currentAppId = appId;
      runningApps.add(appId);
      win.classList.remove("is-minimized");
      
      // Reset position to default (centered) for opening animation
      win.style.top = "";
      win.style.left = "";
      win.style.margin = "";
      
      // Fixed small offset from center
      var offsetX = STACK_OFFSET;
      var offsetY = STACK_OFFSET;
      win.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px)) scale(0.92)`;

      win.style.display = "block";
      win.setAttribute("aria-hidden", "false");
      focusWindow(appId);

      // Launch logic: next frame add .is-open so CSS transition runs.
      requestAnimationFrame(function () {
        win.classList.add("is-open");
        // Maintain the offset in the open state
        win.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px)) scale(1)`;
        updateIndicators();
        if (appId === "terminal") {
          window.dispatchEvent(new CustomEvent("terminal-launched"));
        }
        window.setTimeout(function () {
          isAnimating = false;
        }, 240);
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
        runningApps.delete(appId);
        setNextFocus();
        isAnimating = false;
        if (typeof done === "function") done();
      };
      win.addEventListener("transitionend", onDone);
    }

    function minimizeAllWindows() {
      var windows = document.querySelectorAll(".app-window.is-open");
      windows.forEach(function (win) {
        win.classList.remove("is-open");
        win.style.display = "none";
        win.setAttribute("aria-hidden", "true");
      });
      currentAppId = null;
      updateIndicators();
    }

    // Single delegated listener for dock launches and window focus
    document.addEventListener("click", function (e) {
      var isControl = e.target.closest(".app-window__controls");

      // Focus window on click (if not clicking a control)
      var windowClick = e.target.closest(".app-window");
      if (windowClick && !isControl) {
        var id = windowClick.id.replace("app-", "");
        focusWindow(id);
      }

      var launch = e.target.closest("[data-launch-app]");
      if (launch) {
        e.preventDefault();
        var appId = launch.getAttribute("data-launch-app");
        var win = getWindowEl(appId);

        var isRunning = runningApps.has(appId);
        var isFocused = (currentAppId === appId);
        var isMinimized = win && win.classList.contains("is-minimized");

        if (!isRunning) {
          openApp(appId);
        } else if (isFocused) {
          minimizeApp(appId);
        } else if (isMinimized) {
          restoreApp(appId);
        } else {
          focusWindow(appId);
        }

        // Terminal focus logic
        if (appId === "terminal") {
          setTimeout(function () {
            var input = document.getElementById("terminal-input");
            if (input) input.focus();
          }, 300);
        }
        return;
      }
      var closeBtn = e.target.closest("[data-app-close]");
      if (closeBtn) {
        closeApp(closeBtn.getAttribute("data-app-close"));
      }
      var minimizeBtn = e.target.closest("[data-app-minimize]");
      if (minimizeBtn) {
        var appId = minimizeBtn.getAttribute("data-app-minimize");
        minimizeApp(appId);
      }
    });

    /**
     * Window Dragging Logic
     */
    (function () {
      var isDragging = false;
      var dragWin = null;
      var startMouseX, startMouseY, startLeft, startTop;

      document.addEventListener("mousedown", function (e) {
        var titlebar = e.target.closest(".app-window__titlebar");
        if (!titlebar || e.target.closest(".app-window__controls")) return;

        var win = titlebar.closest(".app-window");
        if (!win) return;

        isDragging = true;
        dragWin = win;

        // Bring to front
        var appId = win.id.replace("app-", "");
        focusWindow(appId);

        // Capture starting positions
        startMouseX = e.clientX;
        startMouseY = e.clientY;

        // Get current computed position
        var rect = win.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;

        // Switch to pixel-based positioning
        // Remove transitions during drag for responsiveness
        win.style.transition = "none";
        win.style.transform = "none";
        win.style.left = startLeft + "px";
        win.style.top = startTop + "px";
        win.style.margin = "0";

        document.body.style.userSelect = "none";
      });

      document.addEventListener("mousemove", function (e) {
        if (!isDragging || !dragWin) return;

        var dx = e.clientX - startMouseX;
        var dy = e.clientY - startMouseY;

        dragWin.style.left = (startLeft + dx) + "px";
        dragWin.style.top = (startTop + dy) + "px";
      });

      document.addEventListener("mouseup", function () {
        if (isDragging) {
          isDragging = false;
          if (dragWin) {
            // Restore transitions for subsequent open/close
            dragWin.style.transition = "";
          }
          dragWin = null;
          document.body.style.userSelect = "";
        }
      });
    })();

    /**
     * Terminal specific logic
     */
    var terminalInput = document.getElementById("terminal-input");
    var terminalOutput = document.getElementById("terminal-output");

    if (terminalInput && terminalOutput) {
      (function() {
        var hasShownTerminalBanner = false;
        function showTerminalBanner() {
          if (hasShownTerminalBanner) return;
          hasShownTerminalBanner = true;
          var banner = [
            "  ______          _     _                         ",
            " |  ____|        | |   (_)                        ",
            " | |__ ___   ___ | |__  _  ___   _ __ ___   ___  ___ ",
            " |  __/ _ \\ / _ \\| '_ \\| |/ _ \\ | |_ \\ _ \\ / _ \\/ __|",
            " | | | (_) | (_) | (_) | |  __/ | | | | | | (_) \\__ \\",
            " |_|  \\___/ \\___/|____/|_|\\___| |_| |_| |_|\\___/|___/",
            "",
            "Welcome to techieman.os",
            "Interactive developer portfolio environment",
            "",
            'Type "help" to view commands',
            'Type "about" to know more about me',
            ""
          ];
          banner.forEach(function(l) {
            var div = document.createElement("div");
            div.style.whiteSpace = "pre";
            div.textContent = l;
            terminalOutput.appendChild(div);
          });
          terminalOutput.scrollTop = terminalOutput.scrollHeight;
        }
        window.addEventListener("terminal-launched", showTerminalBanner);
      })();

      terminalInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          var cmd = terminalInput.value.trim();
          var line = document.createElement("div");
          line.innerHTML = '<span class="terminal-prompt">techieman@os:~$</span> ' + cmd;
          terminalOutput.appendChild(line);

          // Simple response logic
          var response = document.createElement("div");
          if (cmd === "help") {
            response.textContent = "Available commands: help, clear, about, projects, contact, exit, home";
          } else if (cmd === "cls") {
            terminalOutput.innerHTML = "";
            response = null;
          } else if (cmd === "about" || cmd === "projects" || cmd === "contact") {
            response.textContent = "Opening " + cmd + "...";
            openApp(cmd);
          } else if (cmd === "exit") {
            response.textContent = "Closing terminal in 5 seconds...";

            setTimeout(function () {
              var p = document.createElement("div");
              p.textContent = "Shutting down terminal...";
              terminalOutput.appendChild(p);
              terminalOutput.scrollTop = terminalOutput.scrollHeight;
            }, 1000);

            [3, 2, 1].forEach(function (num, index) {
              setTimeout(function () {
                var p = document.createElement("div");
                p.textContent = String(num);
                terminalOutput.appendChild(p);
                terminalOutput.scrollTop = terminalOutput.scrollHeight;
              }, (index + 2) * 1000);
            });

            setTimeout(function () {
              closeApp("terminal");
            }, 5000);
          } else if (cmd === "home") {
            response.textContent = "All windows minimized";
            minimizeAllWindows();
          } else if (cmd === "sudo make me a sandwich") {
            response.innerHTML = `
<span style="color: #50fa7b;">       █████████</span>
<span style="color: #50fa7b;">       █      █</span>
<span style="color: #50fa7b;">       █  OS  █</span>

<span style="color: #bd93f9;">OS:</span> techieman.os
<span style="color: #bd93f9;">Host:</span> Portfolio System
<span style="color: #bd93f9;">Kernel:</span> JavaScript 1.0
<span style="color: #bd93f9;">Uptime:</span> Since page load
<span style="color: #bd93f9;">Packages:</span> HTML, CSS, JavaScript
<span style="color: #bd93f9;">Shell:</span> Fake Bash
<span style="color: #bd93f9;">WM:</span> Custom Window Manager
<span style="color: #bd93f9;">Terminal:</span> techieman-terminal
<span style="color: #bd93f9;">Developer:</span> Vishal AA`.trim();
          } else if (cmd !== "") {
            response.textContent = "Command not found: " + cmd;
          } else {
            response = null;
          }

          if (response) terminalOutput.appendChild(response);
          terminalInput.value = "";
          terminalOutput.scrollTop = terminalOutput.scrollHeight;
        }
      });
    }
  })();

  /**
   * Sidebar navigation logic (Ubuntu Settings style)
   */
  document.addEventListener("click", function (e) {
    var sidebarItem = e.target.closest(".sidebar-item");
    if (sidebarItem) {
      var sectionId = sidebarItem.getAttribute("data-section");
      var appWindow = sidebarItem.closest(".app-window");

      if (sectionId && appWindow) {
        // Update active sidebar item
        appWindow.querySelectorAll(".sidebar-item").forEach(function (item) {
          item.classList.remove("active");
        });
        sidebarItem.classList.add("active");

        // Update active section
        appWindow.querySelectorAll(".app-section").forEach(function (section) {
          section.classList.remove("active-section");
        });
        var targetSection = document.getElementById(sectionId);
        if (targetSection) {
          targetSection.classList.add("active-section");
        }
      }
    }
  });

  /**
   * System Uptime Counter
   */
  (function () {
    var startTime = Date.now();

    function updateUptime() {
      var uptimeEl = document.getElementById("system-uptime");
      if (!uptimeEl) return;
      var diff = Math.floor((Date.now() - startTime) / 60000); // minutes
      uptimeEl.textContent = diff + " min";
      setTimeout(updateUptime, 60000);
    }
    updateUptime();
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
