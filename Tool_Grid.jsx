// Tool Grid — an EffectCraft extension (original work, MIT OR Apache-2.0).
//
// A compact, always-at-hand panel (Window ▸ Tool Grid.jsx) of one-click tools, laid out as:
//
//   Align grid   3 × 3: align the selected layers to a corner, edge or the centre of the comp.
//   Big buttons  Pre-Comp, Center In Comp, Save Frame.
//   Tool grid    short-name buttons, one click each (each one undo step):
//                FRZ freeze frame at the current time   FIT scale to fit the comp
//                DSH Drop Shadow    ADJ adjustment layer   MIR Mirror
//                SOL solid   SHA shape layer   NUL null   CAM camera   HUE Hue/Saturation
//                FILL Fill   TINT Tint   BLUR Gaussian Blur   LUM Lumetri Color   CURV Curves
//                3D 3D layer   SHY shy   LCK lock   MB motion blur   B&W Black & White
//   Text         a text field and a TXT button: adds a centred text layer using the typed text
//                (or "Text" if empty) and the current color. Set Color also recolors text layers.
//   Color        a swatch, a hex field, preset colors and a color picker dialog (square, hue bar,
//                H S B / R G B / hex fields). Set Color applies it to the selected solid layers,
//                shape fills and Fill effects; new solids and shapes use it too.
//
// Hover a button for its tip. Uses only After Effects' documented scripting API.

(function toolGrid(thisObj) {
  var ui = thisObj instanceof Panel ? thisObj : new Window("palette", "Tool Grid", undefined, { resizeable: true });
  ui.orientation = "column";
  ui.alignChildren = ["fill", "top"];
  ui.spacing = 8;
  ui.margins = 10;

  var status;

  // ---------------------------------------------------------------- helpers
  function say(t) {
    if (status) status.text = t;
  }

  function comp() {
    var c = app.project.activeItem;
    if (!(c instanceof CompItem)) {
      say("Open a composition first.");
      return null;
    }
    return c;
  }

  function layers(min) {
    var c = comp();
    if (!c) return null;
    var sel = c.selectedLayers, out = [];
    for (var i = 0; i < sel.length; i++) out.push(sel[i]);
    out.sort(function (a, b) { return a.index - b.index; });
    if (out.length < min) {
      say("Select a layer.");
      return null;
    }
    return out;
  }

  function undoable(name, fn) {
    app.beginUndoGroup(name);
    try {
      fn();
    } catch (e) {
      say("Error: " + (e && e.message ? e.message : e));
    } finally {
      app.endUndoGroup();
    }
  }

  // The layer's own rectangle: its source rectangle when it has one, else its width and height.
  function box(l, t) {
    try {
      var r = l.sourceRectAtTime(t, false);
      if (r && r.width > 0 && r.height > 0) return { left: r.left, top: r.top, width: r.width, height: r.height };
    } catch (e) {}
    return { left: 0, top: 0, width: l.width, height: l.height };
  }

  // The layer's bounds in comp space at `t` (its four corners through scale, rotation, position).
  function bounds(l, t) {
    var tr = l.transform, b = box(l, t);
    var a = tr.anchorPoint.valueAtTime(t, false), p = tr.position.valueAtTime(t, false), s = tr.scale.valueAtTime(t, false);
    var rot = 0;
    try {
      rot = (l.threeDLayer ? tr.zRotation.valueAtTime(t, false) : tr.rotation.valueAtTime(t, false)) * Math.PI / 180;
    } catch (e) {}
    var cs = Math.cos(rot), sn = Math.sin(rot);
    var xs = [b.left, b.left + b.width], ys = [b.top, b.top + b.height];
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (var i = 0; i < 2; i++) {
      for (var j = 0; j < 2; j++) {
        var dx = (xs[i] - a[0]) * s[0] / 100, dy = (ys[j] - a[1]) * s[1] / 100;
        var x = p[0] + dx * cs - dy * sn, y = p[1] + dx * sn + dy * cs;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY, w: maxX - minX, h: maxY - minY };
  }

  // Move a layer by (dx, dy) comp pixels: every Position key when animated, else its value.
  function moveBy(l, dx, dy) {
    var p = l.transform.position;
    function plus(v) {
      var r = v.slice(0);
      r[0] += dx;
      r[1] += dy;
      return r;
    }
    if (p.numKeys > 0) {
      for (var k = 1; k <= p.numKeys; k++) p.setValueAtKey(k, plus(p.keyValue(k)));
    } else {
      p.setValue(plus(p.value));
    }
  }

  // Align the layer's bounds to (fx, fy) of the comp: 0 = left/top, 0.5 = centre, 1 = right/bottom.
  function alignLayer(l, c, fx, fy) {
    if (l.parent) return false;
    var b = bounds(l, c.time);
    var tx = fx === 0 ? 0 : fx === 1 ? c.width - b.w : (c.width - b.w) / 2;
    var ty = fy === 0 ? 0 : fy === 1 ? c.height - b.h : (c.height - b.h) / 2;
    moveBy(l, tx - b.minX, ty - b.minY);
    return true;
  }

  function addEffect(name, matchName) {
    var sel = layers(1);
    if (!sel) return;
    var n = 0;
    undoable("Add " + name, function () {
      for (var i = 0; i < sel.length; i++) {
        try {
          sel[i].Effects.addProperty(matchName);
          n++;
        } catch (e) {}
      }
    });
    say(n ? name + " added to " + n + " layer(s)." : "Can't add " + name + " to this layer.");
  }

  // ---------------------------------------------------------------- top: align grid + big buttons
  var top = ui.add("group");
  top.orientation = "row";
  top.alignChildren = ["left", "top"];
  top.spacing = 12;

  var grid = top.add("group");
  grid.orientation = "column";
  grid.spacing = 3;
  var glyph = ["↖", "↑", "↗", "←", "◎", "→", "↙", "↓", "↘"];
  var tips = ["top left", "top", "top right", "left", "centre", "right", "bottom left", "bottom", "bottom right"];

  function alignBtn(parent, i) {
    var b = parent.add("button", undefined, glyph[i]);
    b.preferredSize = [34, 30];
    b.helpTip = "Align to the comp's " + tips[i];
    b.onClick = function () {
      var sel = layers(1);
      if (!sel) return;
      var c = comp(), n = 0;
      undoable("Align to Comp", function () {
        for (var k = 0; k < sel.length; k++) if (alignLayer(sel[k], c, (i % 3) / 2, Math.floor(i / 3) / 2)) n++;
      });
      say(n ? "Aligned " + n + " layer(s) to the " + tips[i] + "." : "Parented layers can't be aligned.");
    };
  }

  for (var r = 0; r < 3; r++) {
    var g = grid.add("group");
    g.orientation = "row";
    g.spacing = 3;
    for (var k = 0; k < 3; k++) alignBtn(g, r * 3 + k);
  }

  var big = top.add("group");
  big.orientation = "column";
  big.alignChildren = ["fill", "top"];
  big.alignment = ["fill", "top"];
  big.spacing = 3;

  function bigBtn(text, tip) {
    var b = big.add("button", undefined, text);
    b.preferredSize.height = 30;
    b.alignment = ["fill", "top"];
    b.helpTip = tip;
    return b;
  }

  var bPre = bigBtn("Pre-Comp", "Move the selected layers into a new composition");
  var bCen = bigBtn("Center In Comp", "Centre the selected layers' bounds in the comp");
  var bSave = bigBtn("Save Frame", "Save the current frame as a PNG (File ▸ Save Frame As)");

  bPre.onClick = function () {
    var sel = layers(1);
    if (!sel) return;
    var c = comp(), idx = [];
    for (var i = 0; i < sel.length; i++) idx.push(sel[i].index);
    undoable("Pre-Compose", function () {
      c.layers.precompose(idx, sel.length === 1 ? sel[0].name + " Comp" : "Pre-comp", true);
    });
    say("Pre-composed " + sel.length + " layer(s).");
  };

  bCen.onClick = function () {
    var sel = layers(1);
    if (!sel) return;
    var c = comp(), n = 0;
    undoable("Center In Comp", function () {
      for (var i = 0; i < sel.length; i++) if (alignLayer(sel[i], c, 0.5, 0.5)) n++;
    });
    say(n ? "Centred " + n + " layer(s)." : "Parented layers can't be centred.");
  };

  var saveTo;

  bSave.onClick = function () {
    var c = comp();
    if (!c) return;
    var frame = Math.round(c.time / c.frameDuration);
    var name = c.name.replace(/[^A-Za-z0-9_\-]+/g, "_") + "_" + frame + ".png";
    var f = null;
    var dir = saveTo.text.replace(/[\/\\]+$/, "");
    if (dir) f = new File(dir + "/" + name);
    else f = File.saveDialog("Save Frame", "PNG:*.png");
    if (!f) {
      say("Type a folder in Save to, then click Save Frame.");
      return;
    }
    try {
      c.saveFrameToPng(c.time, f);
      say("Saved " + name + ".");
    } catch (e) {
      say("Couldn't save: " + (e && e.message ? e.message : e));
    }
  };

  // ---------------------------------------------------------------- tool grid
  var tools = ui.add("group");
  tools.orientation = "column";
  tools.alignChildren = ["fill", "top"];
  tools.spacing = 4;

  var rows = [
    [["FRZ", "Freeze the layer at the current time (time remap, one held key)", freeze],
     ["FIT", "Scale to fit inside the comp and centre", fitComp],
     ["DSH", "Add a Drop Shadow effect", function () { addEffect("Drop Shadow", "ADBE Drop Shadow"); }],
     ["ADJ", "New adjustment layer", newAdjustment],
     ["MIR", "Add a Mirror effect", function () { addEffect("Mirror", "ADBE Mirror"); }]],
    [["SOL", "New comp-size solid", newSolid],
     ["SHA", "New shape layer with a rectangle", newShape],
     ["NUL", "New null layer", newNull],
     ["CAM", "New camera", newCamera],
     ["HUE", "Add Hue/Saturation", function () { addEffect("Hue/Saturation", "ADBE HUE SATURATION"); }]],
    [["FILL", "Add a Fill effect", function () { addEffect("Fill", "ADBE Fill"); }],
     ["TINT", "Add a Tint effect", function () { addEffect("Tint", "ADBE Tint"); }],
     ["BLUR", "Add a Gaussian Blur", function () { addEffect("Gaussian Blur", "ADBE Gaussian Blur 2"); }],
     ["LUM", "Add Lumetri Color", function () { addEffect("Lumetri Color", "ADBE Lumetri"); }],
     ["CURV", "Add Curves", function () { addEffect("Curves", "ADBE CurvesCustom"); }]],
    [["3D", "Toggle 3D on the selected layers", function () { toggle("threeDLayer", "3D Layer"); }],
     ["SHY", "Toggle shy", function () { toggle("shy", "Shy"); }],
     ["LCK", "Toggle lock", function () { toggle("locked", "Lock"); }],
     ["MB", "Toggle motion blur", function () { toggle("motionBlur", "Motion Blur"); }],
     ["B&W", "Add Black & White", function () { addEffect("Black & White", "ADBE Black&White"); }]],
  ];

  function freeze() {
    var sel = layers(1);
    if (!sel) return;
    var c = comp(), n = 0;
    undoable("Freeze Frame", function () {
      for (var i = 0; i < sel.length; i++) {
        var l = sel[i];
        try {
          l.timeRemapEnabled = true;
          var tr = l.property("ADBE Time Remapping");
          var v = tr.valueAtTime(c.time, false);
          tr.setValueAtTime(c.time, v);
          for (var k = tr.numKeys; k >= 1; k--) if (Math.abs(tr.keyTime(k) - c.time) > 1e-6) tr.removeKey(k);
          tr.setInterpolationTypeAtKey(1, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
          n++;
        } catch (e) {}
      }
    });
    say(n ? "Froze " + n + " layer(s) at " + c.time.toFixed(2) + " s." : "Can't freeze this layer (it needs a source with time).");
  }

  function fitComp() {
    var sel = layers(1);
    if (!sel) return;
    var c = comp(), n = 0;
    undoable("Fit to Comp", function () {
      for (var i = 0; i < sel.length; i++) {
        var l = sel[i];
        if (l.parent) continue;
        var s = l.transform.scale;
        var cur = s.value;
        var b0 = bounds(l, c.time);
        if (!b0.w || !b0.h) continue;
        var f = Math.min(c.width / b0.w, c.height / b0.h);
        var next = [];
        for (var d = 0; d < cur.length; d++) next.push(cur[d] * f);
        if (s.numKeys > 0) s.setValueAtTime(c.time, next);
        else s.setValue(next);
        alignLayer(l, c, 0.5, 0.5);
        n++;
      }
    });
    say(n ? "Fit " + n + " layer(s) to the comp." : "Nothing to fit.");
  }

  function newAdjustment() {
    var c = comp();
    if (!c) return;
    undoable("New Adjustment Layer", function () {
      var l = c.layers.addSolid([1, 1, 1], "Adjustment", c.width, c.height, c.pixelAspect, c.duration);
      l.adjustmentLayer = true;
      l.moveToBeginning();
    });
  }

  function newSolid() {
    var c = comp();
    if (!c) return;
    undoable("New Solid", function () {
      c.layers.addSolid(useColor.value ? color.slice(0) : [0.5, 0.5, 0.5], "Solid", c.width, c.height, c.pixelAspect, c.duration);
    });
  }

  function newShape() {
    var c = comp();
    if (!c) return;
    undoable("New Shape Layer", function () {
      var l = c.layers.addShape();
      l.name = "Shape";
      try {
        var grp = l.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
        var inner = grp.property("ADBE Vectors Group");
        inner.addProperty("ADBE Vector Shape - Rect");
        var fill = inner.addProperty("ADBE Vector Graphic - Fill");
        if (useColor.value) fill.property("ADBE Vector Fill Color").setValue([color[0], color[1], color[2], 1]);
        l.transform.position.setValue([c.width / 2, c.height / 2]);
      } catch (e) {
        // An empty shape layer is still useful: the contents are drawn by hand.
      }
    });
  }

  function newNull() {
    var c = comp();
    if (!c) return;
    undoable("New Null", function () {
      c.layers.addNull().name = "Null";
    });
  }

  function newText() {
    var c = comp();
    if (!c) return;
    var str = textField.text.replace(/^\s+|\s+$/g, "");
    if (!str) str = "Text";
    undoable("New Text Layer", function () {
      var l = c.layers.addText(str);
      try {
        var prop = l.property("ADBE Text Properties").property("ADBE Text Document");
        var doc = prop.value;
        if (useColor.value) {
          doc.applyFill = true;
          doc.fillColor = [color[0], color[1], color[2]];
        }
        doc.justification = ParagraphJustification.CENTER_JUSTIFY;
        prop.setValue(doc);
      } catch (e) {}
      l.transform.position.setValue([c.width / 2, c.height / 2]);
      l.moveToBeginning();
      for (var i = 1; i <= c.numLayers; i++) c.layer(i).selected = (c.layer(i) === l);
    });
    say("Text layer added.");
  }

  function newCamera() {
    var c = comp();
    if (!c) return;
    undoable("New Camera", function () {
      c.layers.addCamera("Camera", [c.width / 2, c.height / 2]);
    });
  }

  function toggle(prop, label) {
    var sel = layers(1);
    if (!sel) return;
    // If every selected layer has it on, turn it off; otherwise turn it on.
    var allOn = true, i;
    for (i = 0; i < sel.length; i++) if (!sel[i][prop]) allOn = false;
    var n = 0;
    undoable("Toggle " + label, function () {
      for (var k = 0; k < sel.length; k++) {
        try {
          sel[k][prop] = !allOn;
          n++;
        } catch (e) {}
      }
    });
    say(label + (allOn ? " off" : " on") + " for " + n + " layer(s).");
  }

  function toolBtn(parent, spec) {
    var b = parent.add("button", undefined, spec[0]);
    b.preferredSize = [48, 30];
    b.alignment = ["fill", "center"];
    b.helpTip = spec[1];
    b.onClick = spec[2];
  }

  for (var ri = 0; ri < rows.length; ri++) {
    var rg = tools.add("group");
    rg.orientation = "row";
    rg.alignChildren = ["fill", "center"];
    rg.spacing = 4;
    for (var ci = 0; ci < rows[ri].length; ci++) toolBtn(rg, rows[ri][ci]);
  }

  // Text row: type the text, click TXT (or press Enter) to add a text layer.
  var txtRow = tools.add("group");
  txtRow.orientation = "row";
  txtRow.alignChildren = ["fill", "center"];
  txtRow.spacing = 4;
  var textField = txtRow.add("edittext", undefined, "");
  textField.alignment = ["fill", "center"];
  textField.helpTip = "Text for the new text layer (leave empty for \"Text\")";
  var bTxt = txtRow.add("button", undefined, "TXT");
  bTxt.preferredSize = [48, 30];
  bTxt.alignment = ["right", "center"];
  bTxt.helpTip = "New text layer, centred in the comp, in the current color";
  bTxt.onClick = newText;
  textField.onEnterKey = newText;


  // ---------------------------------------------------------------- color
  var color = [0.5, 0.5, 0.5];

  function toHex(c) {
    var out = "#";
    for (var i = 0; i < 3; i++) {
      var h = Math.round(Math.max(0, Math.min(1, c[i])) * 255).toString(16);
      out += h.length < 2 ? "0" + h : h;
    }
    return out.toUpperCase();
  }

  function parseHex(t) {
    var m = /^#?([0-9a-fA-F]{6})$/.exec(String(t).replace(/\s+/g, ""));
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }


  // ---------------------------------------------------------------- color picker dialog
  function rgb2hsb(c) {
    var r = c[0], g = c[1], b = c[2];
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d > 0) {
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return [h, mx === 0 ? 0 : d / mx, mx];
  }

  function hsb2rgb(h, s, v) {
    var c = v * s, x = c * (1 - Math.abs(((h % 360) / 60) % 2 - 1)), m = v - c;
    var sx = Math.floor((h % 360) / 60), r = 0, g = 0, b = 0;
    if (sx === 0) { r = c; g = x; }
    else if (sx === 1) { r = x; g = c; }
    else if (sx === 2) { g = c; b = x; }
    else if (sx === 3) { g = x; b = c; }
    else if (sx === 4) { r = x; b = c; }
    else { r = c; b = x; }
    return [r + m, g + m, b + m];
  }

  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  // A color dialog: a saturation / brightness square, a hue bar, the new and old color, H S B and
  // R G B fields and a hex field. Returns [r, g, b] (0-1) on OK, or null on Cancel.
  function pickColor(start) {
    var old = start.slice(0), cur = start.slice(0), hsb = rgb2hsb(start);
    var SVW = 220, SVH = 220, HW = 22;
    var dlg = new Window("dialog", "Color");
    dlg.orientation = "row";
    dlg.alignChildren = ["left", "top"];
    dlg.spacing = 10;
    dlg.margins = 12;

    var sv = dlg.add("group");
    sv.preferredSize = [SVW, SVH];
    var hb = dlg.add("group");
    hb.preferredSize = [HW, SVH];
    var side = dlg.add("group");
    side.orientation = "column";
    side.alignChildren = ["fill", "top"];
    side.spacing = 4;

    var prev = side.add("group");
    prev.preferredSize = [96, 64];
    prev.helpTip = "New color above, the color you started with below (click it to go back)";

    function field(label, width) {
      var r = side.add("group");
      r.orientation = "row";
      r.alignChildren = ["left", "center"];
      r.spacing = 4;
      var t = r.add("statictext", undefined, label);
      t.preferredSize.width = 16;
      var e = r.add("edittext", undefined, "");
      e.preferredSize.width = width || 48;
      return e;
    }

    var fH = field("H:"), fS = field("S:"), fBr = field("B:");
    var fR = field("R:"), fG = field("G:"), fBl = field("B:");
    var fHex = field("#", 64);
    var okBtn = side.add("button", undefined, "OK");
    var cancelBtn = side.add("button", undefined, "Cancel");

    function refresh() {
      fH.text = String(Math.round(hsb[0]) % 360);
      fS.text = String(Math.round(hsb[1] * 100));
      fBr.text = String(Math.round(hsb[2] * 100));
      fR.text = String(Math.round(cur[0] * 255));
      fG.text = String(Math.round(cur[1] * 255));
      fBl.text = String(Math.round(cur[2] * 255));
      fHex.text = toHex(cur).slice(1);
    }

    function setHSB(h, sat, v) {
      hsb = [Math.max(0, Math.min(360, h)), clamp01(sat), clamp01(v)];
      cur = hsb2rgb(hsb[0], hsb[1], hsb[2]);
      refresh();
    }

    function setRGB(c) {
      var n = rgb2hsb(c);
      if (n[1] === 0 || n[2] === 0) n[0] = hsb[0]; // a grey keeps the hue you were on
      cur = [clamp01(c[0]), clamp01(c[1]), clamp01(c[2])];
      hsb = n;
      refresh();
    }

    function number(f, lo, hi, fallback) {
      var v = parseFloat(f.text);
      return isNaN(v) ? fallback : Math.max(lo, Math.min(hi, v));
    }

    fH.onChange = function () { setHSB(number(fH, 0, 360, hsb[0]), hsb[1], hsb[2]); };
    fS.onChange = function () { setHSB(hsb[0], number(fS, 0, 100, hsb[1] * 100) / 100, hsb[2]); };
    fBr.onChange = function () { setHSB(hsb[0], hsb[1], number(fBr, 0, 100, hsb[2] * 100) / 100); };
    function rgbField() {
      setRGB([number(fR, 0, 255, cur[0] * 255) / 255, number(fG, 0, 255, cur[1] * 255) / 255, number(fBl, 0, 255, cur[2] * 255) / 255]);
    }
    fR.onChange = rgbField;
    fG.onChange = rgbField;
    fBl.onChange = rgbField;
    fHex.onChange = function () {
      var c = parseHex(fHex.text);
      if (c) setRGB(c);
      else refresh();
    };

    // Drawing: the square is a grid of cells (no gradients in ScriptUI), the bar a column of strips.
    sv.onDraw = function () {
      var g = this.graphics, w = this.size.width, h = this.size.height, N = 20, cw = w / N, ch = h / N;
      for (var i = 0; i < N; i++) {
        for (var j = 0; j < N; j++) {
          var c = hsb2rgb(hsb[0], (i + 0.5) / N, 1 - (j + 0.5) / N);
          g.newPath();
          g.rectPath(i * cw, j * ch, cw + 1, ch + 1);
          g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, [c[0], c[1], c[2], 1]));
        }
      }
      var x = hsb[1] * w, y = (1 - hsb[2]) * h;
      g.newPath();
      g.ellipsePath(x - 6, y - 6, 12, 12);
      g.strokePath(g.newPen(g.PenType.SOLID_COLOR, [0, 0, 0, 1], 3));
      g.newPath();
      g.ellipsePath(x - 6, y - 6, 12, 12);
      g.strokePath(g.newPen(g.PenType.SOLID_COLOR, [1, 1, 1, 1], 1.5));
    };

    hb.onDraw = function () {
      var g = this.graphics, w = this.size.width, h = this.size.height, N = 36, sh = h / N;
      for (var j = 0; j < N; j++) {
        var c = hsb2rgb(360 * (1 - (j + 0.5) / N), 1, 1);
        g.newPath();
        g.rectPath(0, j * sh, w, sh + 1);
        g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, [c[0], c[1], c[2], 1]));
      }
      var y = (1 - hsb[0] / 360) * h;
      g.newPath();
      g.rectPath(0, y - 2, w, 4);
      g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, [0, 0, 0, 1]));
      g.newPath();
      g.rectPath(0, y - 1, w, 2);
      g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, [1, 1, 1, 1]));
    };

    prev.onDraw = function () {
      var g = this.graphics, w = this.size.width, h = this.size.height;
      g.newPath();
      g.rectPath(0, 0, w, h / 2);
      g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, [cur[0], cur[1], cur[2], 1]));
      g.newPath();
      g.rectPath(0, h / 2, w, h / 2);
      g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, [old[0], old[1], old[2], 1]));
    };

    // Mouse: press and drag on the square or the bar. A drag ends when the pointer leaves it.
    function dragOn(ctl, at) {
      var down = false;
      ctl.addEventListener("mousedown", function (e) { down = true; at(e); });
      ctl.addEventListener("mousemove", function (e) { if (down) at(e); });
      ctl.addEventListener("mouseup", function () { down = false; });
      ctl.addEventListener("mouseout", function () { down = false; });
    }
    dragOn(sv, function (e) { setHSB(hsb[0], clamp01(e.clientX / SVW), 1 - clamp01(e.clientY / SVH)); });
    dragOn(hb, function (e) { setHSB((1 - clamp01(e.clientY / SVH)) * 360, hsb[1], hsb[2]); });
    prev.addEventListener("click", function (e) { if (e.clientY > 32) setRGB(old); });

    okBtn.onClick = function () { dlg.close(1); };
    cancelBtn.onClick = function () { dlg.close(2); };
    refresh();
    return dlg.show() === 1 ? cur : null;
  }

  var colorBox = ui.add("panel", undefined, "Color");
  colorBox.orientation = "column";
  colorBox.alignChildren = ["fill", "top"];
  colorBox.margins = [8, 14, 8, 8];
  colorBox.spacing = 5;

  var cRow = colorBox.add("group");
  cRow.orientation = "row";
  cRow.alignChildren = ["left", "center"];
  var swatch = cRow.add("group");
  swatch.preferredSize = [34, 24];
  swatch.helpTip = "The current color";
  swatch.onDraw = function () {
    var g = this.graphics;
    g.newPath();
    g.rectPath(0, 0, this.size.width, this.size.height);
    g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, [color[0], color[1], color[2], 1]));
  };
  var hex = cRow.add("edittext", undefined, toHex(color));
  hex.preferredSize.width = 74;
  hex.helpTip = "Type a hex color, like #FF3366";
  var bPick = cRow.add("button", undefined, "Pick…");
  bPick.preferredSize.width = 48;
  bPick.helpTip = "Open the color picker";
  var bApply = cRow.add("button", undefined, "Set Color");
  bApply.alignment = ["fill", "center"];
  bApply.helpTip = "Apply to the selected solid layers, shape fills, text layers and Fill effects";

  function setColor(c) {
    color = c;
    hex.text = toHex(c);
    try {
      swatch.notify("onDraw");
    } catch (e) {}
  }

  hex.onChange = function () {
    var c = parseHex(hex.text);
    if (c) setColor(c);
    else {
      hex.text = toHex(color);
      say("Use a hex color like #FF3366.");
    }
  };

  // Preset swatches: click one to make it the current color.
  var presets = ["#FFFFFF", "#000000", "#E53935", "#FB8C00", "#FDD835", "#43A047", "#1E88E5", "#8E24AA"];
  var pRow = colorBox.add("group");
  pRow.orientation = "row";
  pRow.spacing = 3;
  pRow.alignment = ["center", "top"];

  function presetSwatch(h) {
    var g = pRow.add("group");
    g.preferredSize = [22, 18];
    g.helpTip = h;
    var c = parseHex(h);
    g.onDraw = function () {
      var gr = this.graphics;
      gr.newPath();
      gr.rectPath(0, 0, this.size.width, this.size.height);
      gr.fillPath(gr.newBrush(gr.BrushType.SOLID_COLOR, [c[0], c[1], c[2], 1]));
    };
    g.addEventListener("click", function () { setColor(c); });
  }

  for (var pi = 0; pi < presets.length; pi++) presetSwatch(presets[pi]);

  var useColor = colorBox.add("checkbox", undefined, "New solids and shapes use this color");
  useColor.value = true;
  var applyOnPick = colorBox.add("checkbox", undefined, "Apply to the selection when picked");
  applyOnPick.value = true;

  function pick() {
    var c = pickColor(color);
    if (!c) return;
    setColor(c);
    if (applyOnPick.value) bApply.onClick();
  }

  bPick.onClick = pick;
  swatch.addEventListener("click", pick);

  // Every Fill color inside a property group (shape contents, nested groups).
  function fillShapeColors(group, c, depth) {
    var n = 0;
    if (depth > 6) return 0;
    for (var i = 1; i <= group.numProperties; i++) {
      var p = group.property(i);
      if (p.matchName === "ADBE Vector Graphic - Fill") {
        p.property("ADBE Vector Fill Color").setValue([c[0], c[1], c[2], 1]);
        n++;
      } else if (p.numProperties !== undefined && p.propertyType !== PropertyType.PROPERTY) {
        n += fillShapeColors(p, c, depth + 1);
      }
    }
    return n;
  }

  bApply.onClick = function () {
    var sel = layers(1);
    if (!sel) return;
    var n = 0;
    undoable("Set Color", function () {
      for (var i = 0; i < sel.length; i++) {
        var l = sel[i];
        // A solid layer: its solid takes the color (every layer using that solid changes with it).
        try {
          var src = l.source;
          if (src && !l.adjustmentLayer && String(src.mainSource) === "[object SolidSource]") {
            src.replaceWithSolid(color, undefined, src.width, src.height);
            n++;
          }
        } catch (e) {}
        // A shape layer: the fills in its contents.
        try {
          var contents = l.property("ADBE Root Vectors Group");
          if (contents) n += fillShapeColors(contents, color, 0);
        } catch (e2) {}
        // A text layer: its fill color.
        try {
          var tp = l.property("ADBE Text Properties");
          if (tp) {
            var td = tp.property("ADBE Text Document");
            var tdoc = td.value;
            tdoc.applyFill = true;
            tdoc.fillColor = [color[0], color[1], color[2]];
            td.setValue(tdoc);
            n++;
          }
        } catch (e4) {}
        // Fill effects.
        try {
          var fx = l.Effects;
          for (var k = 1; k <= fx.numProperties; k++) {
            if (fx.property(k).matchName === "ADBE Fill") {
              fx.property(k).property("Color").setValue([color[0], color[1], color[2], 1]);
              n++;
            }
          }
        } catch (e3) {}
      }
    });
    say(n ? "Color " + toHex(color) + " set on " + n + " item(s)." : "Select a solid, shape, text layer, or a layer with a Fill effect.");
  };

  // ---------------------------------------------------------------- save-to folder and status
  var saveRow = ui.add("group");
  saveRow.alignChildren = ["left", "center"];
  saveRow.add("statictext", undefined, "Save to:");
  saveTo = saveRow.add("edittext", undefined, "");
  saveTo.alignment = ["fill", "center"];
  saveTo.helpTip = "Folder for Save Frame (leave empty to be asked)";

  status = ui.add("statictext", undefined, "Select layers, then pick a tool.", { name: "status" });
  status.alignment = ["fill", "top"];

  if (ui instanceof Window) ui.show();
  else ui.layout.layout(true);
})(this);
