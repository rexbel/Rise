/**
 * DAY-OF: stand counter state machine (runs in the browser on keypoints).
 * - Stand = hip height crosses from the sit band to the stand band (hysteresis, per-patient calibration in setup).
 * - Arm use = wrists leave the opposite shoulders during the rise (CDC rule -> STEADI score 0, raw count kept).
 * - Half-way rule: a stand more than halfway up at 30 s counts.
 * - Stop = Stop button, or no stand for 8 s -> paused screen ("keep going or finish here").
 * - Asymmetry = left vs right knee-angle difference at mid-rise.
 */
export {}
