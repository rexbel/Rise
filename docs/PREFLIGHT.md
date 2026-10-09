# Preflight (day of, Oct 9)

Run on the morning of the build, not the night before. Rex owns the list below; Jeremiah's is at the end. Items still open fold into the day's first blocks in [DAY-OF.md](DAY-OF.md); a status note follows each.

Everything here is environment setup or seed data. Confirm at the 9:00 keynote whether pre-scaffolded code is allowed; if not, start from a fresh repo and copy `seed/`, `config/`, `content/`, and `public/voice/` only.

- [x] `git push` this scaffold to github.com/rexbel/Rise
- [x] `npm install && npm run check && npm run dev` on the demo laptop; open `/clinic` (dev runs on :3400, `.claude/launch.json` → `rise-dev`)
- [x] **Tunnel:** `npm run tunnel:named` → fixed URL https://rise.nextrex.health (named tunnel `rise`, separate from Anchor's). Open it on the phone over cellular (Wi-Fi off) and load `/p/rise-01`. Fallback: `PORT=3400 npm run tunnel` gives a throwaway `*.trycloudflare.com` URL that changes on every restart
- [x] **Camera over HTTPS:** on the phone, confirm the browser asks for camera permission on a tunnel URL (confirmed by the `/dev/pose` benchmark)
- [x] **Pose model:** `pip install ultralytics onnx onnxslim && python scripts/export_pose_onnx.py` → `public/models/pose.onnx` (try `POSE_MODEL=yolo26n-pose.pt` too). Intel Mac: PyTorch stops at 2.2.2, so pin `torch==2.2.2 torchvision==0.17.2 numpy==1.26.4 onnx==1.17.0 opencv-python==4.10.0.84 ml-dtypes==0.4.1` or pip backtracks for 30+ min
- [x] **Phone benchmark:** record fps for YOLO (WebGPU, WASM) and MediaPipe on Rex's phone. YOLO is kept only at ≥ 15 fps
  - Oct 9, `/dev/pose` via tunnel: YOLO WebGPU 16.6 fps / 59 ms / 814 ms load (keep, thin margin); YOLO WASM 14.8 / 65 / 238 (drop); MediaPipe 56.1 / 15 / 163. Decision (Oct 9): keep YOLO WebGPU at 320 px as the primary tier; MediaPipe stays preloaded for the mid-test swap under 12 fps. Re-export at 256 px only if the stage-light test shows it sagging.
- [x] **Voice:** set `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` in `.env.local` (voice `cjVigY5qzO86Huf0OWal`, from the LandingPad agent), run `npm run voice` → 52 mp3s in `public/voice/`; listen to `instr_1`–`instr_5`, `paused`, `emergency`
- [ ] **Twilio:** _open._ number active; trial accounts can only text verified numbers, so verify Rex's phone; send one test SMS
- [ ] **Fallback clips:** _open; record live at `/dev/pose` once the fixture recorder lands, or film now and upload._ with the phone propped side-on at floor level (whole body in frame, armless chair against a wall), record three 30 s videos of yourself: `rise-01-arms` (push off with hands from rep 2, 3 slow stands), `rise-02-asym` (6 stands, shift weight onto your right leg), `rise-06-arms` (arms every rep, 6 stands). AirDrop them to the laptop; the fixture recorder turns them into keypoint fixtures (see `fixtures/README.md`)
- [ ] **Stage kit:** _Rex to confirm._ phone stand or tripod, armless chair, charger, HDMI/USB-C adapter
- [ ] **Accounts ready:** _Rex to confirm; keys go in `.env.local`._ W&B API key, ElevenLabs, Twilio, Cloudflare; Cosmos/VAST endpoints come from organizers
- [ ] _Rex to confirm._ Charge everything; download the backup video tools you'll use for the screen recording

## Jeremiah
- [ ] Clone github.com/rexbel/Rise; `npm install && npm run check && npm run dev`; open `/clinic`
- [ ] Read [BUILD-PLAN.md](BUILD-PLAN.md) §5 (console C1–C4), §6 (architecture, model guards), §6b (ownership and seams), §9 (your demo beats)
- [ ] Read the VAST, Cosmos, and W&B Inference / Weave docs; note what auth and upload/search calls look like
- [ ] W&B API key ready; `pip`/`npm` Weave install checked
- [ ] Plan the contracts you need in `lib/types.ts` for the contracts PR: `ClipRef`, `SearchHit` (drafted in [#1](https://github.com/rexbel/Rise/pull/1); review it)
- [ ] Screen recorder installed for the backup recording you own
