/**
 * Bricks Floating Panels  (v1.6.0)
 *
 * Per-panel control of the Bricks Settings (#bricks-panel) and Structure
 * (#bricks-structure) panels. Mode per panel: hidden | float | dock.
 *
 * Robust geometry: floating size/position is driven by an injected stylesheet
 * that targets each panel BY ID (#bricks-panel{...}), so Bricks' constant
 * re-renders of the panel node can't wipe it.
 *
 * Resizing is done with preset size buttons (S / M / L / XL) in the drag bar,
 * which reliably set the size through that stylesheet (drag-to-resize fought
 * Bricks' own panel sizing and was removed).
 *
 * Toolbar: each panel has a toggle (show/hide) and a sticky pin (dock). Drag bar
 * has a move handle (left) and size buttons + an × close (right). Clicking a
 * canvas element auto-opens Settings. Drag to a side edge to dock; near the top
 * to snap flush. Cmd/Ctrl + Shift + F = show-all / hide-all.
 */
(function () {
	'use strict';

	var LS_KEY = 'bfp_state_v1';
	var STATE_V = 160;

	var PANELS = [
		// overflow: how the floating panel scrolls. Settings has its own inner
		// scroll area (hidden avoids a double scrollbar); Structure does not, so it
		// scrolls at the panel level (auto).
		{ id: 'bricks-panel', key: 'settings', label: 'Settings', overflow: 'hidden',
		  defaults: { left: 14, top: 58, width: 320, height: 600 } },
		{ id: 'bricks-structure', key: 'structure', label: 'Structure', overflow: 'hidden',
		  defaults: { right: 72, top: 58, width: 320, height: 600 } }
	];

	var DRAGBAR_H = 30; // our floating panel drag-bar height
	// Bricks' element quick-access toolbar (the far-left vertical shortcuts).
	var QUICK_ACCESS_ID = 'bricks-panel-element-quick-access';
	var qaWidthCache = 0;
	function getQAWidth() {
		if (qaWidthCache) { return qaWidthCache; }
		var qa = document.getElementById(QUICK_ACCESS_ID);
		if (qa) {
			var w = qa.offsetWidth; // unaffected by Bricks' off-screen transform
			if (w > 20 && w < 120) { qaWidthCache = w; return w; }
		}
		return 50;
	}

	// Preset size multipliers (applied to each panel's default width/height).
	var SIZES = [
		{ key: 'S',  mult: 0.8, title: 'Smaller' },
		{ key: 'M',  mult: 1,   title: 'Standard size' },
		{ key: 'L',  mult: 1.5, title: 'Larger (1.5×)' },
		{ key: 'XL', mult: 2,   title: 'Largest (2×)' }
	];

	var SETTINGS_PANEL = PANELS[0];
	var settings = window.BFP_SETTINGS || { defaultActive: false };
	// 2.0 dashboard options (all default off if not provided).
	var OPT = (settings && settings.options) || {};
	var stackTab = 'bricks-panel'; // active panel id when side-docking is "tabbed"

	// Transparency is gated entirely on the dashboard setting. If it's off there,
	// it's off everywhere (the per-session toggle is ignored). If on, it defaults
	// on and the droplet can flip it per browser.
	var transparencyOn = false;
	if (OPT.transparency) {
		transparencyOn = true;
		try {
			var ls = localStorage.getItem('bfp_transparency');
			if (ls === '0') { transparencyOn = false; }
			else if (ls === '1') { transparencyOn = true; }
		} catch (e) {}
	}

	// Stacking is gated on the dashboard setting; activatable live, persisted.
	var stackActive = false;
	if (OPT.stack) {
		stackActive = true;
		try {
			var ss = localStorage.getItem('bfp_stack');
			if (ss === '0') { stackActive = false; }
			else if (ss === '1') { stackActive = true; }
		} catch (e) {}
	}
	function stackOn() { return !!OPT.stack && stackActive; }
	function isStacked(p) { return stackOn() && modeOf(p) !== 'hidden'; }

	var EASE_OUT = 'cubic-bezier(.16,.84,.34,1)';
	var EASE_IN  = 'cubic-bezier(.4,0,.7,.2)';
	var SNAP = 22;
	var DOCK_ZONE = 40;
	var TOP_MIN = 56; // floating panels never go above this (clears the toolbar)

	var autoOpened = {};
	var animating = {};
	var desired = {};
	var interacting = false;

	// Stacking: the last-interacted floating panel rises to the top.
	var zCounter = 100000;
	var zOrder = {};
	function zFor(p) { return zOrder[p.id] || 100000; }
	function bringToFront(p) {
		if (modeOf(p) !== 'float') { return; }
		if (zOrder[p.id] === zCounter) { return; } // already on top
		zCounter++;
		zOrder[p.id] = zCounter;
		renderStyles();
	}

	/* ---------------------------------------------------------------- state */

	function loadState() {
		try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
		catch (e) { return {}; }
	}
	function saveState() {
		try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
	}

	var state = loadState();

	(function migrate() {
		state.panels = state.panels || {};
		var hadGlobal = typeof state.active !== 'undefined';
		var globalActive = !!state.active;
		delete state.active;
		PANELS.forEach(function (p) {
			var g = state.panels[p.id] || (state.panels[p.id] = {});
			if (!g.mode) {
				if (hadGlobal) { g.mode = globalActive ? 'float' : 'dock'; }
				else if (typeof g.floating === 'boolean') {
					g.mode = g.floating ? (g.hidden ? 'hidden' : 'float') : 'dock';
				} else { g.mode = 'float'; }
				delete g.floating;
				delete g.hidden;
			}
			if (!g.lastShown || g.lastShown === 'hidden') {
				g.lastShown = g.mode === 'hidden' ? 'float' : g.mode;
			}
		});
		if ((state.v || 0) < STATE_V) {
			PANELS.forEach(function (p) {
				delete state.panels[p.id].left;
				delete state.panels[p.id].top;
			});
			state.v = STATE_V;
		}
		saveState();
	})();

	/* -------------------------------------------------------------- helpers */

	function panelEl(p) { return document.getElementById(p.id); }
	function geomFor(p) {
		if (!state.panels[p.id]) { state.panels[p.id] = { mode: 'float', lastShown: 'float' }; }
		return state.panels[p.id];
	}
	function modeOf(p) { return geomFor(p).mode || 'float'; }
	function effMode(p) { return animating[p.id] ? 'float' : modeOf(p); }
	function isVisible(p) { return modeOf(p) !== 'hidden'; }
	function anyVisible() { return PANELS.some(isVisible); }
	function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

	function resolvedGeom(p) {
		var g = geomFor(p);
		var width = typeof g.width === 'number' ? g.width : p.defaults.width;
		var height = typeof g.height === 'number' ? g.height : p.defaults.height;
		var left;
		if (typeof g.left === 'number') { left = g.left; }
		else if (typeof p.defaults.right === 'number') {
			left = Math.max(0, window.innerWidth - width - p.defaults.right);
		} else { left = p.defaults.left; }
		var top = typeof g.top === 'number' ? g.top : p.defaults.top;
		top = Math.max(TOP_MIN, top); // never above the toolbar
		return { left: Math.round(left), top: Math.round(top), width: Math.round(width), height: Math.round(height) };
	}
	function ensureDesired(p) {
		if (!desired[p.id]) { desired[p.id] = resolvedGeom(p); }
		return desired[p.id];
	}

	function afterTransition(el, cb) {
		var done = false;
		function h() {
			if (done) { return; }
			done = true;
			el.removeEventListener('transitionend', h);
			cb();
		}
		el.addEventListener('transitionend', h);
		setTimeout(h, 340);
	}

	/* ------------------------------------------- injected geometry stylesheet */

	var styleTag;
	// Resolve a panel's on-screen rect: its free-float position normally, or a
	// stacked / tabbed slot on one side when side-docking is enabled.
	function panelGeo(p) {
		var d = ensureDesired(p);
		if (!isStacked(p)) {
			return { left: d.left, top: d.top, width: d.width, height: d.height, hidden: false };
		}
		var ww = window.innerWidth, wh = window.innerHeight, top0 = 58, gap = 14, pad = 8, W = 340;
		var x = (OPT.stack_side === 'left') ? pad : (ww - W - pad);
		if (OPT.stack_layout === 'tabbed') {
			var tabsH = 32;
			return { left: x, top: top0 + tabsH, width: W,
				height: Math.max(200, wh - top0 - tabsH - pad), hidden: (stackTab !== p.id) };
		}
		// Stacked: split the side's height across the visible panels.
		var fp = PANELS.filter(function (pp) { return effMode(pp) !== 'hidden'; });
		var n = fp.length || 1;
		var idx = Math.max(0, fp.indexOf(p));
		var totalH = wh - top0 - pad;
		var each = Math.floor((totalH - gap * (n - 1)) / n);
		return { left: x, top: top0 + idx * (each + gap), width: W, height: each, hidden: false };
	}

	function renderStyles() {
		if (!styleTag) {
			styleTag = document.createElement('style');
			styleTag.id = 'bfp-dynamic';
			(document.head || document.documentElement).appendChild(styleTag);
		}
		var css = '';
		PANELS.forEach(function (p) {
			var mode = effMode(p);
			// Native dock is left to Bricks, unless stacking is overriding it.
			if (mode === 'dock' && !isStacked(p)) { return; }
			var g = panelGeo(p);
			css += '#' + p.id + '{position:fixed!important;left:' + g.left + 'px!important;top:' + g.top +
				'px!important;width:' + g.width + 'px!important;height:' + g.height +
				'px!important;right:auto!important;bottom:auto!important;margin:0!important;' +
				'z-index:' + zFor(p) + '!important;max-height:none!important;overflow:' + (p.overflow || 'hidden') + '!important;' +
				'resize:none!important;' +
				'border-radius:8px!important;box-shadow:0 12px 44px rgba(0,0,0,.5),0 0 0 1px rgba(0,0,0,.4)!important;}';
			// Kill the native browser resize grip anywhere inside the panel, and
			// hide any resizer-handle element Bricks draws in the corner.
			css += '#' + p.id + ',#' + p.id + ' *{resize:none!important;}';
			css += '#' + p.id + ' [class*="resiz" i]{display:none!important;}';
			// Make the scrollbar clearly visible so scroll depth is obvious.
			css += '#' + p.id + ',#' + p.id + ' *{scrollbar-width:thin!important;scrollbar-color:rgba(255,255,255,.32) transparent!important;}';
			css += '#' + p.id + '::-webkit-scrollbar,#' + p.id + ' *::-webkit-scrollbar{width:10px!important;height:10px!important;}';
			css += '#' + p.id + '::-webkit-scrollbar-thumb,#' + p.id + ' *::-webkit-scrollbar-thumb{background:rgba(255,255,255,.3)!important;border-radius:6px!important;}';
			css += '#' + p.id + '::-webkit-scrollbar-track,#' + p.id + ' *::-webkit-scrollbar-track{background:rgba(0,0,0,.2)!important;}';
			// Settings panel (floating, visible): pin Bricks' element quick-access
			// toolbar to the panel's left edge so it rides along.
			if (p.id === 'bricks-panel' && !g.hidden && (mode === 'float' || isStacked(p))) {
				// Stacked panels have no drag bar, so don't offset by its height.
				var barH = (mode === 'float' && !isStacked(p)) ? DRAGBAR_H : 0;
				var qaTop = g.top + barH;
				var qaH = Math.max(0, g.height - barH);
				var qaW = getQAWidth();
				css += '#' + QUICK_ACCESS_ID + '{position:fixed!important;left:' + g.left +
					'px!important;top:' + qaTop + 'px!important;right:auto!important;bottom:auto!important;' +
					'height:' + qaH + 'px!important;margin:0!important;transform:none!important;' +
					'transition:none!important;justify-content:flex-start!important;align-content:flex-start!important;' +
					'z-index:' + (zFor(p) + 1) +
					'!important;border-radius:0 0 0 8px!important;}';
				// Bricks pushes these shortcuts to the bottom; keep them at the top.
				css += '#' + QUICK_ACCESS_ID + ' > *{margin-top:0!important;}';
				css += '#' + QUICK_ACCESS_ID + ' .toggle{display:none!important;}';
				css += '#bricks-panel-element{margin-left:' + qaW + 'px!important;}';
			}
			// Structure panel (floating/stacked): keep its header fixed and scroll
			// only the inner list, matching the Settings panel's behavior.
			if (p.id === 'bricks-structure' && !g.hidden && (mode === 'float' || isStacked(p))) {
				css += '#bricks-structure{display:flex!important;flex-direction:column!important;}';
				css += '#bricks-structure .panel-content{flex:1 1 auto!important;min-height:0!important;overflow:auto!important;}';
			}
			if (mode === 'hidden' || g.hidden) { css += '#' + p.id + '{display:none!important;}'; }
		});
		// Bricks renders modal-style layers (the Templates browser and other
		// popups in #bricks-popup) and the top toolbar with z-indexes far below our
		// panels' 100000+, so the panels paint over them. Lift those overlays above
		// the front-most panel, tracking the climbing z-counter. Order: toolbar on
		// top (its data-balloon tooltips/dropdowns drop down over everything), then
		// the popup, then the panels — so the toolbar stays usable while a popup is
		// open, and panels never go above TOP_MIN to cover the toolbar anyway.
		css += '#bricks-popup{z-index:' + (zCounter + 5) + '!important;}';
		css += '#bricks-toolbar{z-index:' + (zCounter + 9) + '!important;}';
		// Stacking is a LOCKED dock: pad the canvas area on the stack side so the
		// centered preview reserves a gutter, and cap the wrapper so it can't spill
		// under the panels.
		if (stackOn()) {
			var reserve = 340 + 16; // stack width + padding
			var prop = (OPT.stack_side === 'left') ? 'padding-left' : 'padding-right';
			// Medium-grey gutter so the dark panels (and the gap between Settings and
			// Structure) read clearly against it.
			css += '#bricks-preview{' + prop + ':' + reserve + 'px!important;box-sizing:border-box!important;background:#3a4049!important;}';
			css += '#bricks-builder-iframe-wrapper{max-width:100%!important;}';
		}
		styleTag.textContent = css;
	}

	/* ----------------------------------------------------------- apply panel */

	function applyPanel(p) {
		var el = panelEl(p);
		if (!el || animating[p.id]) { return; }
		renderStyles();
		// Stacked = a locked arrangement: positioned by renderStyles, no drag chrome
		// and no tear-off tab.
		if (isStacked(p)) {
			removeChrome(el);
			hideDockGrab(p);
			hideHeightGrip(p);
			return;
		}
		if (modeOf(p) === 'float') {
			addChrome(el, p);
			hideNativeResizers(p);
			hideDockGrab(p);
			positionHeightGrip(p);
		} else {
			removeChrome(el);
			hideHeightGrip(p);
			if (modeOf(p) === 'dock') { positionDockGrab(p); } else { hideDockGrab(p); }
		}
	}

	/* ----------------------------------- tear-off grab tab (docked panels) */

	var dockGrabs = {};
	// Watch the docked panel's size so the grab tab follows native resizing.
	var dockRO = null;
	function ensureDockRO() {
		if (dockRO || typeof ResizeObserver === 'undefined') { return dockRO; }
		dockRO = new ResizeObserver(function () { syncDockGrabs(); });
		return dockRO;
	}
	function ensureDockGrab(p) {
		var g = dockGrabs[p.id];
		if (!g) {
			g = document.createElement('div');
			g.className = 'bfp-dock-grab';
			g.title = 'Drag to float the ' + p.label + ' panel';
			g.innerHTML = moveIconSVG();
			document.body.appendChild(g);
			dockGrabs[p.id] = g;
			g.addEventListener('mousedown', function (e) {
				if (e.button !== 0) { return; }
				e.preventDefault();
				e.stopPropagation();
				beginDetach(p, e);
			});
		}
		return g;
	}
	function positionDockGrab(p) {
		var el = panelEl(p);
		var g = ensureDockGrab(p);
		// No tear-off tab in native dock only; stacked panels are locked.
		if (!el || modeOf(p) !== 'dock' || isStacked(p)) { g.style.display = 'none'; return; }
		var ro = ensureDockRO();
		if (ro) { try { ro.observe(el); } catch (err) {} }
		var r = el.getBoundingClientRect();
		var ww = window.innerWidth, wh = window.innerHeight;
		// Only show when the docked panel is actually laid out on-screen.
		var sane = r.width >= 60 && r.height >= 80 &&
			r.right > 0 && r.left < ww && r.bottom > 0 && r.top < wh;
		if (!sane) { g.style.display = 'none'; return; }
		g.style.display = 'flex';
		// Tab sits on the panel's canvas-facing edge, vertically centered & clamped.
		var dockedLeft = r.left <= 60;
		var x = dockedLeft ? (r.right - 7) : (r.left - 8);
		var y = r.top + r.height / 2 - 23;
		g.style.left = Math.round(clamp(x, 0, ww - 15)) + 'px';
		g.style.top = Math.round(clamp(y, 8, wh - 54)) + 'px';
	}
	function hideDockGrab(p) {
		if (dockGrabs[p.id]) { dockGrabs[p.id].style.display = 'none'; }
	}

	/* ------------------------------------- height resize handle (floating) */

	var heightGrips = {};
	function ensureHeightGrip(p) {
		var g = heightGrips[p.id];
		if (!g) {
			g = document.createElement('div');
			g.className = 'bfp-vresize';
			g.title = 'Drag to resize height';
			g.innerHTML = '<span class="bfp-vresize-bar"></span>';
			document.body.appendChild(g);
			heightGrips[p.id] = g;
			makeHeightResizable(g, p);
		}
		return g;
	}
	function positionHeightGrip(p) {
		var g = ensureHeightGrip(p);
		// Only while truly floating (not stacked, docked, hidden, or animating).
		if (modeOf(p) !== 'float' || isStacked(p) || animating[p.id]) { g.style.display = 'none'; return; }
		var d = ensureDesired(p);
		g.style.display = 'block';
		g.style.left = d.left + 'px';
		g.style.top = (d.top + d.height - 5) + 'px';
		g.style.width = d.width + 'px';
	}
	function hideHeightGrip(p) {
		if (heightGrips[p.id]) { heightGrips[p.id].style.display = 'none'; }
	}
	function makeHeightResizable(grip, p) {
		var startY, startH;
		function onDown(e) {
			if (e.button !== 0) { return; }
			e.preventDefault();
			e.stopPropagation();
			startY = e.clientY;
			startH = ensureDesired(p).height;
			interacting = true;
			document.body.classList.add('bfp-dragging');
			document.addEventListener('mousemove', onMove);
			document.addEventListener('mouseup', onUp);
			window.addEventListener('mouseup', onUp, true);
		}
		function onMove(e) {
			var d = ensureDesired(p);
			d.height = clamp(startH + (e.clientY - startY), 200, window.innerHeight - 20);
			renderStyles();
			positionHeightGrip(p);
		}
		function onUp() {
			interacting = false;
			document.body.classList.remove('bfp-dragging');
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
			window.removeEventListener('mouseup', onUp, true);
			finalizeGeom(p);
		}
		grip.addEventListener('mousedown', onDown);
	}

	// Some Bricks/AT builds draw a resize handle element (not the CSS `resize`
	// property) in the panel corner. We can't size it anyway, so hide any
	// descendant that carries a resize cursor. Cheap 2-level scan.
	function checkResizer(n) {
		if (!n || n.__bfpResHidden || !n.classList) { return; }
		if (n.classList.contains('bfp-dragbar') || n.closest('.bfp-dragbar')) { return; }
		var cur = getComputedStyle(n).cursor || '';
		if (cur.indexOf('resize') !== -1) {
			n.style.setProperty('display', 'none', 'important');
			n.classList.add('bfp-res-hidden');
			n.__bfpResHidden = true;
		}
	}
	var lastResScan = {};
	function hideNativeResizers(p) {
		var el = panelEl(p);
		if (!el || modeOf(p) !== 'float') { return; }
		var now = Date.now();
		if (lastResScan[p.id] && now - lastResScan[p.id] < 400) { return; }
		lastResScan[p.id] = now;
		var nodes = el.querySelectorAll('*');
		var max = Math.min(nodes.length, 900);
		for (var i = 0; i < max; i++) { checkResizer(nodes[i]); }
	}
	// Restore native resize handles we hid (called when a panel docks again, so
	// Bricks' own panel resizing works in the locked/docked state).
	function restoreNativeResizers(p) {
		var el = panelEl(p);
		if (!el) { return; }
		el.querySelectorAll('.bfp-res-hidden').forEach(function (n) {
			n.style.removeProperty('display');
			n.classList.remove('bfp-res-hidden');
			delete n.__bfpResHidden;
		});
	}

	function revertPanel(p) {
		var el = panelEl(p);
		if (el) { clearAnim(el); removeChrome(el); restoreNativeResizers(p); }
		renderStyles();
	}

	/* --------------------------------------------------- animated transitions */

	function animateIn(p) {
		var el = panelEl(p);
		if (!el) { return; }
		animating[p.id] = true;
		ensureDesired(p);
		zCounter++;
		zOrder[p.id] = zCounter; // newly opened panel comes to the front
		renderStyles();
		addChrome(el, p);
		el.style.transformOrigin = '50% 35%';
		el.style.transition = 'none';
		el.style.opacity = '0';
		el.style.transform = 'scale(.96)';
		void el.offsetWidth;
		el.style.transition = 'transform .2s ' + EASE_OUT + ', opacity .18s ease';
		el.style.opacity = '1';
		el.style.transform = 'scale(1)';
		afterTransition(el, function () {
			clearAnim(el);
			animating[p.id] = false;
			if (modeOf(p) !== 'float') { applyPanel(p); }
		});
	}

	function animateOut(p, done) {
		var el = panelEl(p);
		if (!el) { animating[p.id] = false; if (done) { done(); } return; }
		animating[p.id] = true;
		el.style.transformOrigin = '50% 35%';
		el.style.transition = 'transform .15s ' + EASE_IN + ', opacity .15s ' + EASE_IN;
		void el.offsetWidth;
		el.style.opacity = '0';
		el.style.transform = 'scale(.96)';
		afterTransition(el, function () {
			clearAnim(el);
			animating[p.id] = false;
			if (done) { done(); }
		});
	}

	function clearAnim(el) {
		el.style.removeProperty('transition');
		el.style.removeProperty('transform');
		el.style.removeProperty('opacity');
		el.style.removeProperty('transform-origin');
	}

	/* ----------------------------------------------------- mode transitions */

	function setMode(p, mode, opts) {
		var prev = modeOf(p);
		var g = geomFor(p);
		g.mode = mode;
		if (mode !== 'hidden') { g.lastShown = mode; }
		autoOpened[p.id] = !!(opts && opts.auto);
		saveState();
		updateButtons();

		if (mode === prev) { applyPanel(p); return; }
		// Switching into float from any state (Off or Locked) snaps back to the
		// default corner. (Tear-off uses applyPanel directly, so it stays put.)
		if (mode === 'float' && prev !== 'float') { resetPosition(p); }
		if (mode === 'float') { animateIn(p); }
		else if (mode === 'hidden') { animateOut(p, function () { applyPanel(p); }); }
		else if (mode === 'dock') { animateOut(p, function () { revertPanel(p); }); }
	}

	function togglePanel(p) {
		if (modeOf(p) === 'hidden') { setMode(p, geomFor(p).lastShown || 'float'); }
		else { setMode(p, 'hidden'); }
	}
	function toggleDock(p) { setMode(p, modeOf(p) === 'dock' ? 'float' : 'dock'); }
	function showAll(show) {
		PANELS.forEach(function (p) {
			setMode(p, show ? (geomFor(p).lastShown || 'float') : 'hidden');
		});
	}

	/* ------------------------------------------------------- preset sizing */

	function applySize(p, mult) {
		// Presets change WIDTH only; height is left as-is so panels don't get tall.
		var d = ensureDesired(p);
		var w = clamp(Math.round(p.defaults.width * mult), 200, window.innerWidth - 24);
		d.width = w;
		d.left = clamp(d.left, 0, Math.max(0, window.innerWidth - w - 8));
		renderStyles();
		finalizeGeom(p);
		markActiveSize(p, mult);
	}

	function markActiveSize(p, mult) {
		var el = panelEl(p);
		if (!el) { return; }
		var bar = el.querySelector(':scope > .bfp-dragbar');
		if (!bar) { return; }
		bar.querySelectorAll('.bfp-size-btn').forEach(function (b) {
			b.classList.toggle('bfp-size-on', parseFloat(b.dataset.mult) === mult);
		});
	}

	// Highlight the preset closest to the panel's current width (so the default
	// shows M lit up on open).
	function highlightCurrentSize(p) {
		var w = ensureDesired(p).width;
		var best = SIZES[1], diff = Infinity;
		SIZES.forEach(function (s) {
			var d = Math.abs(p.defaults.width * s.mult - w);
			if (d < diff) { diff = d; best = s; }
		});
		markActiveSize(p, best.mult);
	}

	/* ---------------------------------------- inject drag bar (+ size buttons) */

	function moveIconSVG() {
		return '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">' +
			'<path fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" ' +
			'd="M8 1.6v12.8M1.6 8h12.8M8 1.6 6 3.6M8 1.6l2 2M8 14.4l-2-2M8 14.4l2-2M1.6 8l2-2M1.6 8l2 2M14.4 8l-2-2M14.4 8l-2 2"/></svg>';
	}
	function dockIconSVG() {
		return '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">' +
			'<rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
			'<rect x="2.2" y="3.2" width="4" height="9.6" rx="1" fill="currentColor"/></svg>';
	}
	function closeIconSVG() {
		return '<svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true">' +
			'<path d="M3.5 3.5l7 7M10.5 3.5l-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
	}
	function settingsIconSVG() {
		return '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">' +
			'<path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" d="M2 4.5h7M11.5 4.5h2.5M2 11.5h2.5M7 11.5h7"/>' +
			'<circle cx="10" cy="4.5" r="1.9" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
			'<circle cx="5.5" cy="11.5" r="1.9" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
	}
	function structureIconSVG() {
		return '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">' +
			'<rect x="2" y="2.4" width="12" height="3.4" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
			'<rect x="4.5" y="7.2" width="9.5" height="2.7" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/>' +
			'<rect x="4.5" y="10.9" width="9.5" height="2.7" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>';
	}
	function panelIconSVG(p) { return p.key === 'structure' ? structureIconSVG() : settingsIconSVG(); }
	// State icons for the toolbar toggle: off (hidden), float, fixed (dock).
	function floatIconSVG() {
		return '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">' +
			'<rect x="1.5" y="2.5" width="9" height="7" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
			'<rect x="6.5" y="6.5" width="8" height="7" rx="1.4" fill="var(--bfp-icbg,#1f2329)" stroke="currentColor" stroke-width="1.3"/></svg>';
	}
	function offIconSVG() {
		return '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">' +
			'<path d="M2 8s2.2-3.6 6-3.6c1.1 0 2 .25 2.8.66M14 8s-2.2 3.6-6 3.6c-1.1 0-2-.25-2.8-.66" ' +
			'fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>' +
			'<path d="M2.5 2.5l11 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
	}
	function stateIconSVG(mode) {
		return mode === 'dock' ? dockIconSVG() : (mode === 'float' ? floatIconSVG() : offIconSVG());
	}
	// Distinct lock icon for the dock/sticky pin (never matches a state icon).
	function lockIconSVG() {
		return '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">' +
			'<rect x="3.5" y="7" width="9" height="6.4" rx="1.3" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
			'<path d="M5.6 7V5.2a2.4 2.4 0 0 1 4.8 0V7" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';
	}

	function addChrome(el, p) {
		if (el.querySelector(':scope > .bfp-dragbar')) { return; }

		var bar = document.createElement('div');
		bar.className = 'bfp-dragbar';

		var left = document.createElement('span');
		left.className = 'bfp-dragbar-left';
		var move = document.createElement('span');
		move.className = 'bfp-dragbar-move';
		move.setAttribute('aria-hidden', 'true');
		move.innerHTML = moveIconSVG();
		left.appendChild(move);
		var title = document.createElement('span');
		title.className = 'bfp-dragbar-title';
		title.textContent = p.label;
		left.appendChild(title);
		bar.appendChild(left);

		var right = document.createElement('span');
		right.className = 'bfp-dragbar-btns';

		var sizes = document.createElement('span');
		sizes.className = 'bfp-size-group';
		SIZES.forEach(function (s) {
			var b = document.createElement('button');
			b.type = 'button';
			b.className = 'bfp-size-btn';
			b.dataset.mult = s.mult;
			b.title = s.title;
			b.textContent = s.key;
			b.addEventListener('mousedown', stop);
			b.addEventListener('click', function (e) { stop(e); applySize(p, s.mult); });
			sizes.appendChild(b);
		});
		right.appendChild(sizes);

		// Transparency droplet: always shown on float title bars when see-through
		// is enabled in settings.
		if (OPT.transparency) {
			var drop = document.createElement('button');
			drop.type = 'button';
			drop.className = 'bfp-droplet';
			drop.title = 'Toggle panel transparency';
			drop.innerHTML = dropletIconSVG();
			if (transparencyOn) { drop.classList.add('bfp-on'); }
			drop.addEventListener('mousedown', stop);
			drop.addEventListener('click', function (e) { stop(e); toggleTransparency(); });
			right.appendChild(drop);
		}

		var lock = document.createElement('button');
		lock.type = 'button';
		lock.className = 'bfp-dragbar-lock';
		lock.title = 'Lock (dock) the ' + p.label + ' panel';
		lock.innerHTML = dockIconSVG(); // match the toolbar's locked-state icon
		lock.addEventListener('mousedown', stop);
		lock.addEventListener('click', function (e) { stop(e); setMode(p, 'dock'); });
		right.appendChild(lock);

		var close = document.createElement('button');
		close.type = 'button';
		close.className = 'bfp-dragbar-close';
		close.title = 'Close';
		close.innerHTML = closeIconSVG();
		close.addEventListener('mousedown', stop);
		close.addEventListener('click', function (e) { stop(e); setMode(p, 'hidden'); });
		right.appendChild(close);

		bar.appendChild(right);
		el.insertBefore(bar, el.firstChild);
		makeDraggable(bar, p);
		highlightCurrentSize(p);
	}

	function removeChrome(el) {
		var bar = el.querySelector(':scope > .bfp-dragbar');
		if (bar) { bar.remove(); }
	}

	function stop(e) { e.stopPropagation(); }

	/* --------------------------------------------------- edge dock indicator */

	var dockHint;
	function dockHintEl() {
		if (!dockHint) {
			dockHint = document.createElement('div');
			dockHint.id = 'bfp-dock-hint';
			document.body.appendChild(dockHint);
		}
		return dockHint;
	}
	function showDockHint(side) {
		var el = dockHintEl();
		if (!side) { el.style.display = 'none'; return; }
		el.style.display = 'block';
		el.classList.toggle('bfp-hint-left', side === 'left');
		el.classList.toggle('bfp-hint-right', side === 'right');
	}

	/* ----------------------------------------------------------- dragging */

	function makeDraggable(handle, p) {
		var startX, startY, startLeft, startTop, dockSide;

		function onDown(e) {
			if (e.button !== 0) { return; }
			e.preventDefault();
			var d = ensureDesired(p);
			startX = e.clientX;
			startY = e.clientY;
			startLeft = d.left;
			startTop = d.top;
			dockSide = null;
			interacting = true;
			document.body.classList.add('bfp-dragging');
			document.addEventListener('mousemove', onMove);
			document.addEventListener('mouseup', onUp);
		}
		function onMove(e) {
			var d = ensureDesired(p);
			d.left = clamp(startLeft + (e.clientX - startX), 0, window.innerWidth - 60);
			d.top = clamp(startTop + (e.clientY - startY), TOP_MIN, window.innerHeight - 40);
			renderStyles();
			if (d.left <= DOCK_ZONE) { dockSide = 'left'; }
			else if (window.innerWidth - (d.left + d.width) <= DOCK_ZONE) { dockSide = 'right'; }
			else { dockSide = null; }
			showDockHint(dockSide);
		}
		function onUp() {
			interacting = false;
			document.body.classList.remove('bfp-dragging');
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
			showDockHint(null);
			if (dockSide) { setMode(p, 'dock'); return; }
			maybeSnap(p);
		}
		handle.addEventListener('mousedown', onDown);
	}

	function maybeSnap(p) {
		var d = ensureDesired(p);
		if (d.top <= TOP_MIN + SNAP && d.top > TOP_MIN) { tweenTop(p, TOP_MIN); }
		else { finalizeGeom(p); }
	}
	function tweenTop(p, toTop) {
		var d = ensureDesired(p);
		var from = d.top, dur = 150, t0 = performance.now();
		(function step(now) {
			var k = Math.min(1, (now - t0) / dur);
			var e = 1 - Math.pow(1 - k, 3);
			d.top = Math.round(from + (toTop - from) * e);
			renderStyles();
			if (k < 1) { requestAnimationFrame(step); } else { finalizeGeom(p); }
		})(t0);
	}

	function finalizeGeom(p) {
		var d = ensureDesired(p);
		var g = geomFor(p);
		g.left = d.left; g.top = d.top; g.width = d.width; g.height = d.height;
		saveState();
	}

	// Reopen at the default top-corner spot (keeps the chosen size).
	function resetPosition(p) {
		var g = geomFor(p);
		delete g.left;
		delete g.top;
		var r = resolvedGeom(p);
		var d = ensureDesired(p);
		d.left = r.left;
		d.top = r.top;
		saveState();
	}

	/* ----------------------------------------------------- toolbar buttons */

	var wrap, segs = {}, stackBtn = null;

	// Three mutually-exclusive state buttons per panel: Locked / Float / Off.
	var SEG_MODES = [
		{ mode: 'dock',   icon: dockIconSVG,  title: 'Locked (docked)' },
		{ mode: 'float',  icon: floatIconSVG, title: 'Float' },
		{ mode: 'hidden', icon: offIconSVG,   title: 'Off' }
	];

	function buildControls() {
		if (wrap) { return wrap; }
		wrap = document.createElement('div');
		wrap.id = 'bfp-controls';
		PANELS.forEach(function (p) {
			var group = document.createElement('div');
			group.className = 'bfp-seg-wrap';

			var lbl = document.createElement('span');
			lbl.className = 'bfp-seg-label';
			lbl.textContent = p.label;
			group.appendChild(lbl);

			segs[p.id] = [];
			SEG_MODES.forEach(function (s) {
				var b = document.createElement('button');
				b.type = 'button';
				b.className = 'bfp-seg';
				b.dataset.mode = s.mode;
				b.title = p.label + ': ' + s.title;
				b.innerHTML = s.icon();
				b.addEventListener('click', function (e) {
					e.stopPropagation();
					if (s.mode === 'hidden') {
						// Off toggles: if already off, restore the last state.
						if (modeOf(p) === 'hidden') {
							setMode(p, geomFor(p).lastShown || 'float');
						} else {
							setMode(p, 'hidden');
						}
					} else if (modeOf(p) !== s.mode) {
						setMode(p, s.mode);
					}
				});
				segs[p.id].push(b);
				group.appendChild(b);
			});

			wrap.appendChild(group);
		});

		// Stack toggle icon (only when side-docking is enabled in settings).
		if (OPT.stack) {
			stackBtn = document.createElement('button');
			stackBtn.type = 'button';
			stackBtn.id = 'bfp-stack-toggle';
			stackBtn.title = 'Stack panels on one side';
			stackBtn.innerHTML = stackIconSVG();
			stackBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleStack(); });
			wrap.appendChild(stackBtn);
		}
		return wrap;
	}

	function stackIconSVG() {
		return '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">' +
			'<rect x="2.5" y="1.8" width="11" height="4.4" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
			'<rect x="2.5" y="7.8" width="11" height="4.4" rx="1" fill="currentColor"/></svg>';
	}

	function toggleStack() {
		stackActive = !stackActive;
		try { localStorage.setItem('bfp_stack', stackActive ? '1' : '0'); } catch (e) {}
		if (stackActive) {
			// Stacking is a locked arrangement: pull visible panels out of float.
			PANELS.forEach(function (p) {
				if (modeOf(p) !== 'hidden') { geomFor(p).mode = 'dock'; geomFor(p).lastShown = 'dock'; }
			});
			saveState();
		}
		applyAll();
		updateButtons();
		// Let Bricks recompute / recenter the canvas for the new gutter.
		try { window.dispatchEvent(new Event('resize')); } catch (e) {}
	}

	/* ----------------------------------------------- transparency feature */

	function dropletIconSVG() {
		return '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">' +
			'<path d="M8 1.5s5 5.2 5 8.4a5 5 0 0 1-10 0C3 6.7 8 1.5 8 1.5z" fill="currentColor" ' +
			'stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>';
	}
	var transTag;
	// A panel is visually floating (eligible for transparency) only when it's in
	// float mode and not part of a stack. Locked/docked/stacked panels stay solid.
	function isVisuallyFloating(p) { return modeOf(p) === 'float' && !stackOn(); }
	function transparencyCSS() {
		if (!transparencyOn) { return ''; }
		var a = Math.max(0.1, Math.min(1, (OPT.opacity || 80) / 100));
		var a2 = Math.max(0.1, a - 0.35);
		var css = '';
		if (isVisuallyFloating(SETTINGS_PANEL)) {
			css += '#bricks-panel{background:rgba(22,27,29,' + a + ')!important;}' +
				'#bricks-panel-header{background:rgba(22,27,29,' + a2 + ')!important;}' +
				'.bricks-add-element{background:rgba(22,27,29,' + a2 + ')!important;}' +
				'#bricks-panel-tabs li.active{background:rgba(22,27,29,' + a2 + ')!important;}' +
				'#bricks-panel-sticky{background:rgba(22,27,29,' + a2 + ')!important;}';
		}
		if (isVisuallyFloating(PANELS[1])) {
			css += '#bricks-structure{background:rgba(22,27,29,' + a + ')!important;}';
		}
		return css;
	}
	function applyTransparency() {
		if (!transTag) {
			transTag = document.createElement('style');
			transTag.id = 'bfp-transparency';
			(document.head || document.documentElement).appendChild(transTag);
		}
		transTag.textContent = transparencyCSS();
		Array.prototype.forEach.call(document.querySelectorAll('.bfp-droplet'), function (b) {
			b.classList.toggle('bfp-on', transparencyOn);
		});
	}
	function toggleTransparency() {
		transparencyOn = !transparencyOn;
		try { localStorage.setItem('bfp_transparency', transparencyOn ? '1' : '0'); } catch (e) {}
		applyTransparency();
	}

	function mountControls() {
		var el = buildControls();
		if (el.isConnected) { return; }
		var toolbar = document.getElementById('bricks-toolbar');
		if (toolbar) {
			el.classList.remove('bfp-controls--floating');
			// Place our controls to the LEFT of the Undo button so Bricks' own
			// right-side items (Save, etc.) keep their native far-right spot.
			var undo = toolbar.querySelector(
				'[title*="undo" i],[aria-label*="undo" i],[data-balloon*="undo" i],[data-tooltip*="undo" i]'
			);
			if (undo && undo.parentNode) {
				undo.parentNode.insertBefore(el, undo);
			} else {
				toolbar.insertBefore(el, toolbar.firstChild); // fallback: far left
			}
		} else {
			el.classList.add('bfp-controls--floating');
			document.body.appendChild(el);
		}
		updateButtons();
	}

	function updateButtons() {
		var stacked = stackOn();
		PANELS.forEach(function (p) {
			var list = segs[p.id];
			if (!list) { return; }
			var mode = modeOf(p);
			list.forEach(function (b) {
				b.classList.toggle('bfp-seg-on', b.dataset.mode === mode);
				// Float can't coexist with stacking (stacked panels are locked).
				var disable = stacked && b.dataset.mode === 'float';
				b.disabled = disable;
				b.classList.toggle('bfp-seg-disabled', disable);
			});
		});
		if (stackBtn) { stackBtn.classList.toggle('bfp-on', stacked); }
	}

	/* ----------------------------------------- auto-open on canvas selection */

	function isElementTarget(t) {
		return !!(t && t.closest && t.closest('[id^="brxe-"], [class*="brxe-"]'));
	}
	function isEmptyTarget(t) {
		if (!t) { return true; }
		if (t.classList && t.classList.contains('brx-body')) { return true; }
		return t.tagName === 'BODY' || t.tagName === 'HTML';
	}
	function onCanvasClick(e) {
		var t = e.target;
		if (isElementTarget(t)) {
			if (modeOf(SETTINGS_PANEL) === 'hidden') {
				setMode(SETTINGS_PANEL, 'float', { auto: true });
			}
			if (OPT.avoid_overlap) { avoidElement(e); }
		} else if (isEmptyTarget(t)) {
			if (autoOpened[SETTINGS_PANEL.id] && modeOf(SETTINGS_PANEL) === 'float') {
				setMode(SETTINGS_PANEL, 'hidden');
			}
		}
	}

	// Nudge a covering panel just past the nearest clear edge of the selected
	// element (least movement), falling back to the farthest edge if it can't
	// fully clear. Honors which panels the user opted in for.
	function avoidApplies(p) {
		var w = OPT.avoid_which || 'both';
		if (w === 'settings') { return p.id === 'bricks-panel'; }
		if (w === 'structure') { return p.id === 'bricks-structure'; }
		return true;
	}
	function rectsOverlap(a, b) {
		return !(a.left >= b.right || a.right <= b.left || a.top >= b.bottom || a.bottom <= b.top);
	}
	function avoidElement(e) {
		if (stackOn()) { return; } // stacked panels have fixed slots
		var iframe = document.getElementById('bricks-builder-iframe');
		var el = e.target && e.target.closest ? e.target.closest('[id^="brxe-"], [class*="brxe-"]') : null;
		if (!iframe || !el) { return; }
		var io = iframe.getBoundingClientRect();
		var r = el.getBoundingClientRect();
		var er = { left: io.left + r.left, top: io.top + r.top, right: io.left + r.right, bottom: io.top + r.bottom };
		var ww = window.innerWidth, wh = window.innerHeight, GAP = 10, pad = 8;

		// Panels we must not collide with: the element, plus any panel we leave put
		// or have already repositioned this pass (so two moved panels don't stack).
		var placed = [];
		function rectFor(d) { return { left: d.left, top: d.top, right: d.left + d.width, bottom: d.top + d.height }; }
		function clearOf(rect) {
			if (rectsOverlap(rect, er)) { return false; }
			for (var i = 0; i < placed.length; i++) { if (rectsOverlap(rect, placed[i])) { return false; } }
			return true;
		}

		PANELS.forEach(function (p) {
			if (modeOf(p) !== 'float') { return; }
			var d = ensureDesired(p);
			var needsMove = avoidApplies(p) && rectsOverlap(rectFor(d), er);
			if (!needsMove) { placed.push(rectFor(d)); return; }

			var cands = [
				{ axis: 'x', val: er.left - GAP - d.width },
				{ axis: 'x', val: er.right + GAP },
				{ axis: 'y', val: er.top - GAP - d.height },
				{ axis: 'y', val: er.bottom + GAP }
			];
			// Also allow snugging right next to an already-moved panel, so two
			// panels sit adjacent instead of one getting shoved far away.
			placed.forEach(function (q) {
				cands.push({ axis: 'x', val: q.right + GAP });
				cands.push({ axis: 'x', val: q.left - GAP - d.width });
				cands.push({ axis: 'y', val: q.bottom + GAP });
				cands.push({ axis: 'y', val: q.top - GAP - d.height });
			});
			function tryVal(axis, val) {
				var rect = (axis === 'x') ? { left: val, top: d.top, right: val + d.width, bottom: d.top + d.height }
					: { left: d.left, top: val, right: d.left + d.width, bottom: val + d.height };
				return rect;
			}
			var best = null;
			cands.forEach(function (c) {
				var lo = (c.axis === 'x') ? pad : TOP_MIN, hi = (c.axis === 'x') ? (ww - d.width - pad) : (wh - d.height - pad);
				if (c.val < lo || c.val > hi) { return; }
				if (!clearOf(tryVal(c.axis, c.val))) { return; }   // clears element AND placed panels
				var cur = (c.axis === 'x') ? d.left : d.top;
				var move = Math.abs(c.val - cur);
				if (!best || move < best.move) { best = { axis: c.axis, val: c.val, move: move }; }
			});

			if (best) {
				if (best.axis === 'x') { d.left = Math.round(best.val); } else { d.top = Math.round(best.val); }
			} else {
				// Couldn't fully clear: farthest edge, then stagger off any placed panel.
				var roomLeft = er.left, roomRight = ww - er.right, roomTop = er.top, roomBottom = wh - er.bottom;
				var maxRoom = Math.max(roomLeft, roomRight, roomTop, roomBottom);
				if (maxRoom === roomLeft) { d.left = pad; }
				else if (maxRoom === roomRight) { d.left = Math.max(pad, ww - d.width - pad); }
				else if (maxRoom === roomTop) { d.top = TOP_MIN; }
				else { d.top = Math.max(TOP_MIN, wh - d.height - pad); }
				placed.forEach(function (q) {
					if (rectsOverlap(rectFor(d), q)) { d.top = clamp(q.bottom + GAP, TOP_MIN, Math.max(TOP_MIN, wh - d.height - pad)); }
				});
			}
			d.left = clamp(d.left, 0, Math.max(0, ww - d.width - pad));
			d.top = clamp(d.top, TOP_MIN, Math.max(TOP_MIN, wh - d.height - pad));
			placed.push(rectFor(d));
			renderStyles();
			finalizeGeom(p);
		});
	}
	function attachCanvasListener() {
		var iframe = document.getElementById('bricks-builder-iframe');
		if (!iframe) { return; }
		function bind() {
			try {
				var doc = iframe.contentDocument;
				if (doc && !doc.__bfpBound) {
					doc.__bfpBound = true;
					doc.addEventListener('click', onCanvasClick, true);
				}
			} catch (err) { /* cross-origin: skip */ }
		}
		bind();
		iframe.addEventListener('load', bind);
	}

	/* ----------------------------------------------------- keyboard shortcut */

	document.addEventListener('keydown', function (e) {
		if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
			e.preventDefault();
			showAll(!anyVisible());
		}
	});

	// Keep Bricks' right-click context menu above floating panels. Our panels
	// use a climbing z-index (100000+), so when you right-click inside a floating
	// panel (e.g. paste styles in Structure) Bricks' menu would render behind the
	// panel. We lift any context-menu element to a z-index our panels never reach.
	// Selector-agnostic (matches id/class containing "context"+"menu") so it keeps
	// working if Bricks renames the node, and we re-run on each right-click since
	// Bricks may recreate it.
	var CTX_Z = '2147480000';
	function liftContextMenus() {
		var nodes = document.querySelectorAll('[id*="context"], [class*="context"]');
		for (var i = 0; i < nodes.length; i++) {
			var n = nodes[i];
			var cls = n.getAttribute('class') || '';
			if (((n.id || '') + ' ' + cls).toLowerCase().indexOf('menu') === -1) { continue; }
			if (n.closest && n.closest('[id^="bfp-"], .bfp-panel')) { continue; }
			n.style.setProperty('z-index', CTX_Z, 'important');
		}
	}
	document.addEventListener('contextmenu', function () {
		// Bricks positions/creates the menu after the event fires, so retry briefly.
		requestAnimationFrame(liftContextMenus);
		setTimeout(liftContextMenus, 0);
		setTimeout(liftContextMenus, 60);
	}, true);

	// Click (or drag/resize) inside a floating panel raises it above the other.
	document.addEventListener('mousedown', function (e) {
		PANELS.forEach(function (p) {
			if (modeOf(p) !== 'float') { return; }
			var el = panelEl(p);
			if (el && el.contains(e.target)) { bringToFront(p); }
		});
	}, true);

	// Tear-off: drag the top header of a docked panel to pop it into float.
	document.addEventListener('mousedown', function (e) {
		if (e.button !== 0) { return; }
		for (var i = 0; i < PANELS.length; i++) {
			var p = PANELS[i];
			if (modeOf(p) !== 'dock') { continue; }
			var el = panelEl(p);
			if (!el || !el.contains(e.target)) { continue; }
			var r = el.getBoundingClientRect();
			if (e.clientY - r.top > 46) { continue; } // header zone only
			if (e.target.closest('button, input, select, textarea, a, svg, [contenteditable]')) { continue; }
			beginDetach(p, e);
			break;
		}
	}, true);

	function beginDetach(p, e) {
		var startX = e.clientX, startY = e.clientY, converted = false;
		// Disable the iframe immediately so a mouseup over the canvas is always
		// caught by the top document (otherwise the panel "sticks" to the cursor).
		interacting = true;
		document.body.classList.add('bfp-dragging');
		function move(ev) {
			if (!converted) {
				if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 8) { return; }
				converted = true;
				var g = geomFor(p);
				g.mode = 'float';
				g.lastShown = 'float';
				autoOpened[p.id] = false;
				zCounter++;
				zOrder[p.id] = zCounter;
				placeUnderCursor(p, ev);
				saveState();
				updateButtons();
				applyPanel(p); // render float + chrome, no open animation
			} else {
				placeUnderCursor(p, ev);
				renderStyles();
			}
		}
		function up() {
			document.removeEventListener('mousemove', move, true);
			document.removeEventListener('mouseup', up, true);
			window.removeEventListener('mouseup', up, true);
			interacting = false;
			document.body.classList.remove('bfp-dragging');
			if (converted) { finalizeGeom(p); }
		}
		document.addEventListener('mousemove', move, true);
		document.addEventListener('mouseup', up, true);
		window.addEventListener('mouseup', up, true);
	}

	function placeUnderCursor(p, ev) {
		var d = ensureDesired(p);
		d.left = clamp(ev.clientX - 40, 0, window.innerWidth - 60);
		d.top = clamp(ev.clientY - 14, TOP_MIN, window.innerHeight - 40);
	}

	/* ------------------------------- Advanced Themer right elements bar ------- */

	/* Advanced Themer adds a tall, narrow vertical bar of element icons on the
	   far-right edge. It has a transparent background and normally sits over the
	   docked Structure panel; once we float that panel away, the bar hovers over
	   the white canvas and its light icons vanish. We detect the bar and give it
	   a dark background so the icons stay readable. No-op if AT is not present. */

	var rightBar = null;
	var RIGHTBAR_PROPS = ['background-color', 'border-radius', 'box-shadow', 'padding-top', 'padding-bottom'];

	function findRightBar() {
		if (rightBar && rightBar.isConnected) { return rightBar; }
		// Advanced Themer's right-side element shortcuts bar (exact class).
		rightBar = document.querySelector('.brxce-panel-shortcut__wrapper');
		return rightBar;
	}

	function clearRightBarBg() {
		if (rightBar && rightBar.isConnected) {
			RIGHTBAR_PROPS.forEach(function (pr) { rightBar.style.removeProperty(pr); });
		}
	}

	function applyRightBarBg() {
		// Only needed when the right edge is exposed (Structure not docked there).
		if (modeOf(PANELS[1]) === 'dock') { clearRightBarBg(); return; }
		var bar = findRightBar();
		if (!bar) { return; }
		bar.style.setProperty('background-color', 'rgba(26, 29, 35, 0.96)', 'important');
		bar.style.setProperty('border-radius', '10px', 'important');
		bar.style.setProperty('box-shadow', '0 6px 22px rgba(0, 0, 0, 0.45)', 'important');
		bar.style.setProperty('padding-top', '4px', 'important');
		bar.style.setProperty('padding-bottom', '4px', 'important');
	}

	/* --------------------------------------------------------------- boot up */

	function applyAll() { PANELS.forEach(applyPanel); applyRightBarBg(); updateStackTabs(); applyTransparency(); }

	/* ------------------------------- tabbed side-dock tab switcher ---------- */

	var stackTabsEl = null;
	function buildStackTabs() {
		if (stackTabsEl) { return stackTabsEl; }
		stackTabsEl = document.createElement('div');
		stackTabsEl.id = 'bfp-stack-tabs';
		PANELS.forEach(function (p) {
			var b = document.createElement('button');
			b.type = 'button';
			b.dataset.id = p.id;
			b.textContent = p.label;
			b.addEventListener('click', function (e) {
				e.stopPropagation();
				stackTab = p.id;
				// Reveal the panel into the (locked) stack if it was off.
				if (modeOf(p) === 'hidden') { geomFor(p).mode = 'dock'; geomFor(p).lastShown = 'dock'; saveState(); updateButtons(); }
				applyAll();
				updateStackTabs();
			});
			stackTabsEl.appendChild(b);
		});
		document.body.appendChild(stackTabsEl);
		return stackTabsEl;
	}
	function updateStackTabs() {
		var on = stackOn() && OPT.stack_layout === 'tabbed';
		var el = on ? buildStackTabs() : stackTabsEl;
		if (!el) { return; }
		if (!on) { el.style.display = 'none'; return; }
		var ww = window.innerWidth, top0 = 58, pad = 8, W = 340;
		var x = (OPT.stack_side === 'left') ? pad : (ww - W - pad);
		el.style.display = 'flex';
		el.style.left = x + 'px';
		el.style.top = top0 + 'px';
		el.style.width = W + 'px';
		Array.prototype.forEach.call(el.children, function (b) {
			b.classList.toggle('bfp-on', b.dataset.id === stackTab);
		});
	}

	function syncDockGrabs() {
		PANELS.forEach(function (p) {
			if (modeOf(p) === 'dock' && !isStacked(p)) { positionDockGrab(p); } else { hideDockGrab(p); }
			if (modeOf(p) === 'float' && !isStacked(p)) { positionHeightGrip(p); } else { hideHeightGrip(p); }
		});
		updateStackTabs();
	}
	window.addEventListener('resize', syncDockGrabs);
	window.addEventListener('scroll', syncDockGrabs, true);

	var rafId = null;
	function scheduleApply() {
		if (interacting || rafId) { return; }
		rafId = requestAnimationFrame(function () {
			rafId = null;
			if (interacting) { return; }
			if (!document.getElementById('bfp-controls')) { mountControls(); }
			applyAll();
			attachCanvasListener();
		});
	}

	function ready() {
		var tries = 0;
		var timer = setInterval(function () {
			tries++;
			var found = document.getElementById('bricks-toolbar') ||
				document.getElementById('bricks-panel');
			if (found) {
				clearInterval(timer);
				// If stacking is on at load, make visible panels locked (not float).
				if (stackOn()) {
					PANELS.forEach(function (p) {
						if (modeOf(p) !== 'hidden') { geomFor(p).mode = 'dock'; geomFor(p).lastShown = 'dock'; }
					});
					saveState();
				}
				mountControls();
				applyTransparency();
				applyAll();
				attachCanvasListener();
				if (stackOn()) { try { window.dispatchEvent(new Event('resize')); } catch (e) {} }
				new MutationObserver(scheduleApply)
					.observe(document.body, { childList: true, subtree: true });
			} else if (tries > 100) {
				clearInterval(timer);
			}
		}, 300);
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', ready);
	} else {
		ready();
	}
})();
