# Virtual Boxing

Webcam pose-controlled 3D boxing. Throw real punches at the camera; slip, duck, lean and block the opponent's telegraphed attacks.

```
npm install
npm run dev     # http://localhost:5173
npm test
npm run build
```

- **Camera mode**: stand ~2 m back, head/shoulders/both fists in frame, hold your stance for the 1.5 s calibration. Pose tracking is MediaPipe Pose Landmarker, run locally in the browser (nothing is uploaded).
- **Keyboard mode** (no camera): J jab, K cross, H/L hooks, U/I uppercuts, Shift = body, Space guard, A/D slip, S duck, W lean.
- **F2** toggles the debug overlay; **Esc** pauses.
- Detector thresholds live in `src/pose/PunchDetector.ts` (`TUNE`) and `src/pose/DefenseDetector.ts` (`DEF_TUNE`).
