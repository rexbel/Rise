# Preflight (tonight)

Everything here is environment setup or seed data. Confirm at the 9:00 keynote whether pre-scaffolded code is allowed; if not, start from a fresh repo and copy `seed/`, `config/`, `content/`, and `public/voice/` only.

- [ ] `git push` this scaffold to github.com/rexbel/Rise
- [ ] `npm install && npm run check && npm run dev` on the demo laptop; open http://localhost:3000/clinic
- [ ] **Tunnel:** `brew install cloudflared`, then `npm run tunnel`; open the `https://*.trycloudflare.com` URL on the phone over cellular (Wi-Fi off) and load `/p/rise-01`
- [ ] **Camera over HTTPS:** on the phone, confirm the browser asks for camera permission on a tunnel URL (test page day-of; just confirm the tunnel loads tonight)
- [ ] **Pose model:** `pip install ultralytics onnx onnxslim && python scripts/export_pose_onnx.py` → `public/models/pose.onnx` (try `POSE_MODEL=yolo26n-pose.pt` too)
- [ ] **Phone benchmark:** record fps for YOLO (WebGPU, WASM) and MediaPipe on Rex's phone. YOLO is kept only at ≥ 15 fps
- [ ] **Voice:** set `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID`, run `npm run voice` → 52 mp3s in `public/voice/`; listen to `instr_1`–`instr_5`, `paused`, `emergency`
- [ ] **Twilio:** number active; trial accounts can only text verified numbers, so verify Rex's phone; send one test SMS
- [ ] **Fallback clips:** with the phone propped side-on at floor level (whole body in frame, armless chair against a wall), record three 30 s videos of yourself: `rise-01-arms` (push off with hands from rep 2, 3 slow stands), `rise-02-asym` (6 stands, shift weight onto your right leg), `rise-06-arms` (arms every rep, 6 stands). AirDrop them to the laptop; tomorrow the fixture recorder turns them into keypoint fixtures (see `fixtures/README.md`)
- [ ] **Stage kit:** phone stand or tripod, armless chair, charger, HDMI/USB-C adapter
- [ ] **Accounts ready:** W&B API key, ElevenLabs, Twilio, Cloudflare; Cosmos/VAST endpoints come from organizers
- [ ] Charge everything; download the backup video tools you'll use for the screen recording
