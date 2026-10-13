# Pose fixtures

Recorded keypoint streams that the `seeded` pose tier replays through the same counter as live tracking, so the fallback behaves exactly like Rex's real movement. Recorded on build day from the preflight clips (or live), with the fixture recorder at `/dev/fixtures`. Save the downloaded files to `public/fixtures/` (served to the phone); demo mode replays a patient's fixture when it exists, else synthetic frames from `scripted_today`. `tests/fixtures.test.ts` checks every committed fixture replays to its expected counts.

## Files to record

| File | Clip | Movement | Expected counter output |
| --- | --- | --- | --- |
| `rise-01-arms.json` | `rise-01-arms` | 3 slow stands, push off with hands from rep 2 | raw 3, arms used from rep 2 → STEADI 0 |
| `rise-02-asym.json` | `rise-02-asym` | 6 stands, weight shifted onto the right leg | raw 6, no arms, asymmetry ≥ 15%, favoring right |
| `rise-06-arms.json` | `rise-06-arms` | 6 stands, arms on every rep | raw 6, arms every rep → STEADI 0 |

These match each patient's `scripted_today` in `seed/patients.json`, so the replayed session triages the same way as the seed.

## Format

```json
{
  "riseId": "rise-01",
  "variant": "arms",
  "tier": "mediapipe",
  "fps": 24.8,
  "recordedAt": "2026-10-10T10:42:00Z",
  "source": "video:rise-01-arms.mov",
  "expected": { "rawStands": 3, "armsUsed": true, "armsFromRep": 2, "asymmetryPct": null },
  "frames": [
    { "t_ms": -1000, "keypoints": [[0.51, 0.18, 0.97], "... 17 COCO points as [x, y, confidence], normalized 0..1"] }
  ]
}
```

`t_ms` is relative to Go: about 1 s of negative-time seated frames comes first (the counter calibrates on them), then 30 s of test.

Keypoint order is COCO-17: nose, left/right eye, left/right ear, left/right shoulder, left/right elbow, left/right wrist, left/right hip, left/right knee, left/right ankle. MediaPipe's 33 landmarks are mapped to these 17 before saving.

All recordings are of Rex, used only to drive the synthetic demo patients.
