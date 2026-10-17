# EffectCraft motion-graphics panels

Three dockable ScriptUI panels for [EffectCraft](https://github.com/storytold/effectcraft) (and
other hosts that run After Effects-style ScriptUI scripts): one-click tools for motion graphics.

| Panel | What it is |
|---|---|
| **MoGraph Toolkit** | Cloner (linear / grid / radial), random and step effectors, stagger, animate in/out presets, expression helpers (wiggle, loop, overshoot, index offset), controller null, align / distribute. |
| **Quick Motion** | Compact workflow panel: key a value pair, set ease influence on selected keys, pre-comp, track matte, null / adjustment / solid / camera, opacity, fit / fill comp, 3×3 anchor-point grid. |
| **Tool Grid** | 3×3 align-to-comp grid, Pre-Comp, Center In Comp, Save Frame, and a grid of one-click buttons (freeze frame, fit, effects, layer creators, switches) plus a color section with a full color picker dialog. |

Every button is one undo step. The panels use only After Effects' documented scripting API.

## Install

Copy the `.jsx` files from `panels/` into your host's `Scripts/ScriptUI Panels/` folder (or use
File ▸ Scripts ▸ Install ScriptUI Panel…), restart if needed, then open them from the Window menu.

To bundle them into an EffectCraft build instead, copy them to `extensions/scriptui-panels/` in the
EffectCraft source and follow that repo's `docs/plugins.md` and `ATTRIBUTION.md` conventions.

## Status

Written against EffectCraft's scripting runtime and its documentation; not yet tested in a running
app. Issues with the message from a panel's status line are very welcome.

## License

Licensed under either of [Apache License 2.0](LICENSE-APACHE) or [MIT](LICENSE-MIT), at your option.
