import sqlite3, json, sys
db, out = sys.argv[1], sys.argv[2]
c = sqlite3.connect(db)

STEADI_30S_BELOW_AVG = {  # CDC STEADI 30-Second Chair Stand, "below average" if score < value
  "M": {"60-64":14,"65-69":12,"70-74":12,"75-79":11,"80-84":10,"85-89":8,"90-94":7},
  "F": {"60-64":12,"65-69":11,"70-74":10,"75-79":10,"80-84":9,"85-89":8,"90-94":4},
}
def band(age):
    lo = (age//5)*5
    return f"{lo}-{lo+4}"

# Rise overlay: synthetic display name, procedure framing, check-in history, scripted "today" session, expected triage (eval label)
R = [
 dict(src=2842, rise_id="rise-01", name="Ellen Marsh", role="hero",
      procedure="Right total knee arthroplasty", side="right", post_op_day=3,
      risk_flags=["Anticoagulated (warfarin)","History of recurrent VTE","Chronic atrial fibrillation"],
      history=[{"label":"Pre-op clinic","day":-14,"raw":9,"arms":False},{"label":"Discharge PT","day":2,"raw":5,"arms":False}],
      today={"raw":3,"arms":True,"arms_from_rep":2,"asymmetry_pct":19,"favoring":"left",
             "symptoms":{"pain_0_10":6,"dizzy":False,"short_of_breath_or_chest_pain":True,"calf_pain_or_swelling":False,"new_incontinence":False}},
      expected={"recommendation":"escalate_urgent","route":"surgeon_on_call",
                "patient_message":"emergency_instructions",
                "why":"Red-flag symptom (shortness of breath) in an anticoagulated patient with recurrent VTE, plus 40% drop in stands and new arm use."},
      chart_note="Source chart: ED visit for sudden shortness of breath and confusion on post-op day 4 after right TKA."),
 dict(src=2866, rise_id="rise-02", name="Judith Kerr", role="escalate",
      procedure="Left total knee arthroplasty", side="left", post_op_day=7,
      risk_flags=["Warfarin held perioperatively","Chronic atrial fibrillation"],
      history=[{"label":"Discharge PT","day":2,"raw":4,"arms":False},{"label":"Home check-in","day":5,"raw":6,"arms":False}],
      today={"raw":6,"arms":False,"asymmetry_pct":22,"favoring":"right",
             "symptoms":{"pain_0_10":5,"dizzy":False,"short_of_breath_or_chest_pain":False,"calf_pain_or_swelling":True,"new_incontinence":False}},
      expected={"recommendation":"escalate_urgent","route":"surgeon_on_call","patient_message":"same_day_call",
                "why":"New calf pain/swelling on the operated side with 22% weight shift off the left leg while anticoagulation is held."},
      chart_note="Source chart: ED visit for 2-day left calf pain and swelling."),
 dict(src=2218, rise_id="rise-03", name="Walter Brandt", role="callback",
      procedure="Right total knee arthroplasty", side="right", post_op_day=10,
      risk_flags=["Orthostatic lightheadedness (history)","Tamsulosin (alpha-blocker)"],
      history=[{"label":"Discharge PT","day":2,"raw":6,"arms":False},{"label":"Home check-in","day":6,"raw":8,"arms":False}],
      today={"raw":8,"arms":False,"asymmetry_pct":8,"favoring":None,"pauses_over_3s_after_standing":3,
             "symptoms":{"pain_0_10":3,"dizzy":True,"short_of_breath_or_chest_pain":False,"calf_pain_or_swelling":False,"new_incontinence":False}},
      expected={"recommendation":"nurse_callback","route":"care_coordinator","patient_message":"callback_today",
                "why":"Stand count stable, but three post-stand pauses with sway and reported dizziness; suggests orthostatic BP check (STEADI)."},
      chart_note="Source chart: recurrent lightheadedness on standing; urinary retention after TKA."),
 dict(src=2247, rise_id="rise-04", name="Gary Lindqvist", role="on_track",
      procedure="Total hip arthroplasty", side="unspecified", post_op_day=14,
      risk_flags=["Anticoagulated (rivaroxaban)","Obesity"],
      history=[{"label":"Discharge PT","day":2,"raw":5,"arms":False},{"label":"Home check-in","day":7,"raw":7,"arms":False},{"label":"Home check-in","day":10,"raw":9,"arms":False}],
      today={"raw":10,"arms":False,"asymmetry_pct":6,"favoring":None,
             "symptoms":{"pain_0_10":2,"dizzy":False,"short_of_breath_or_chest_pain":False,"calf_pain_or_swelling":False,"new_incontinence":False}},
      expected={"recommendation":"continue_plan","route":None,"patient_message":"encouragement",
                "why":"Steady gains 5 to 10 stands with no arm use or symptoms; still below STEADI norm, as expected two weeks post-op."},
      chart_note="Source chart: routine orthopedic follow-up after hospital discharge for THA."),
 dict(src=2856, rise_id="rise-05", name="Diane Coulter", role="callback",
      procedure="Left total knee arthroplasty", side="left", post_op_day=90,
      risk_flags=["Diabetic polyneuropathy","CKD stage 4","Osseous metastases"],
      history=[{"label":"Post-discharge episode close","day":30,"raw":9,"arms":False},{"label":"Reactivated: first check-in","day":86,"raw":11,"arms":False}],
      episode={"type":"reactivated","start_pod":84,"length_days":30,"cadence_days":7,"set_by":"Surgeon at 3-month visit (balance complaint)"},
      today={"raw":11,"arms":False,"asymmetry_pct":7,"favoring":None,"balance_tandem_hold_s":4,
             "symptoms":{"pain_0_10":2,"dizzy":False,"short_of_breath_or_chest_pain":False,"calf_pain_or_swelling":False,"new_incontinence":False}},
      expected={"recommendation":"nurse_callback","route":"physical_therapy","patient_message":"callback_today",
                "why":"Chair-stand count improving 9 to 11, but tandem stance held 4 s (< 10 s STEADI cutoff): fall risk from neuropathy. PT balance referral."},
      chart_note="Source chart: progressive numbness in hands and feet with difficulty maintaining balance."),
 dict(src=2857, rise_id="rise-06", name="Ruth Abernathy", role="on_track",
      procedure="Hip fracture repair (displaced left femoral neck)", side="left", post_op_day=21,
      risk_flags=["Osteoporosis","COPD","Fall at home (index injury)"],
      history=[{"label":"Discharge PT","day":5,"raw":4,"arms":True},{"label":"Home check-in","day":14,"raw":5,"arms":True}],
      today={"raw":6,"arms":True,"arms_from_rep":1,"asymmetry_pct":12,"favoring":"right",
             "symptoms":{"pain_0_10":3,"dizzy":False,"short_of_breath_or_chest_pain":False,"calf_pain_or_swelling":False,"new_incontinence":False}},
      expected={"recommendation":"continue_plan","route":"physical_therapy","patient_message":"encouragement",
                "why":"STEADI score is 0 (arms used every stand), but arm-assisted count is rising 4 to 6 with no symptoms; continue PT, recheck in 1 week."},
      chart_note="Source chart: inpatient orthopedic admission after mechanical fall at home tripping over a rug."),
 dict(src=2226, rise_id="rise-07", name="Harold Pruitt", role="escalate",
      procedure="Right total hip arthroplasty", side="right", post_op_day=120,
      risk_flags=["Mechanical mitral valve on warfarin","Severe aortic stenosis","CKD stage 3"],
      history=[{"label":"Post-discharge episode close","day":30,"raw":9,"arms":False},{"label":"Reactivated: first check-in","day":113,"raw":8,"arms":False}],
      episode={"type":"reactivated","start_pod":112,"length_days":30,"cadence_days":7,"set_by":"Primary care (walking difficulty, falls)"},
      today={"raw":6,"arms":False,"asymmetry_pct":9,"favoring":None,"gait_observations":["Short strides","Shuffling","En bloc turning"],
             "symptoms":{"pain_0_10":1,"dizzy":False,"short_of_breath_or_chest_pain":False,"calf_pain_or_swelling":False,"new_incontinence":True}},
      expected={"recommendation":"escalate_urgent","route":"primary_care","patient_message":"callback_today",
                "why":"Decline 9 to 6 over two months with shuffling and new incontinence, unrelated to the hip: route to primary care, not the surgeon."},
      chart_note="Source chart: neurology visit for progressive difficulty walking with falls and urinary incontinence."),
]

# Check-in cadence (plan §6a). Deterministic; days until the next check-in.
# Every episode is 30 days by default; clinicians can override length and cadence (episode["set_by"]).
def episode_for(r):
    if "episode" in r: return r["episode"]
    dis = next((h["day"] for h in r["history"] if h["label"].startswith("Discharge")), 2)
    return {"type":"post_discharge","start_pod":dis,"length_days":30,"cadence_days":None,"set_by":"Rise default"}

def phase_interval(ep, pod):
    d = pod - ep["start_pod"]
    if ep.get("cadence_days"): return ep["cadence_days"], f"Clinician cadence, episode day {d}"
    if d <= 14: return 2, f"Episode days 0-14, day {d}"
    return 3, f"Episode days 15-30, day {d}"

def next_checkin(ep, pod, rec, trend, history_trends):
    base, phase = phase_interval(ep, pod)
    if rec == "escalate_urgent":
        return 1, phase, "Recheck the day after the clinician clears the patient"
    if rec == "nurse_callback":
        return min(base, 2), phase, "Recheck within 2 days of the nurse callback"
    if trend == "harder":
        return max(1, base // 2), phase, "Harder than last time: interval halved"
    if trend in ("better", "same") and history_trends >= 2 and pod - ep["start_pod"] > 14 and not ep.get("cadence_days"):
        return base + 1, phase, "Stable or improving twice: interval extended one step"
    return base, phase, "Episode default" if not ep.get("cadence_days") else "Clinician-set cadence"

pts = []
for r in R:
    prof, age, sex, race, ins = c.execute(
        "select profile, age, sex, race_ethnicity, insurance from patients where patient_id=?", (r["src"],)).fetchone()
    p = json.loads(prof)
    t = r["today"]
    steadi_today = 0 if t["arms"] else t["raw"]
    b = band(age)
    cutoff = STEADI_30S_BELOW_AVG[sex].get(b)
    last = r["history"][-1]
    if t["raw"] > last["raw"] and not (t["arms"] and not last["arms"]):
        trend = "better"
    elif t["raw"] < last["raw"] or (t["arms"] and not last["arms"]):
        trend = "harder"
    else:
        trend = "same"
    pts.append({
      "rise_id": r["rise_id"], "display_name": r["name"], "demo_role": r["role"],
      "synthetic": True,
      "source": {"dataset": "Synthetic Hospital v1.3", "patient_id": r["src"],
                 "repo": "https://github.com/sparkcpark/synthetic_hospital", "license": "MIT",
                 "chart_note": r["chart_note"]},
      "demographics": {"age": age, "sex": sex, "race_ethnicity": race, "insurance": ins},
      "chronic_conditions": p.get("chronic_conditions", []),
      "surgical_history": p.get("surgical_history", []),
      "home_medications": [m["name"] + " " + m.get("dose", "") for m in p.get("home_medications", [])],
      "allergies": p.get("allergies", []),
      "episode": {"procedure": r["procedure"], "operated_side": r["side"], "post_op_day_today": r["post_op_day"],
                  "risk_flags": r["risk_flags"]},
      "protocol": {"name": "CDC STEADI 30-Second Chair Stand",
                   "steadi_age_band": b, "steadi_below_average_if_under": cutoff,
                   "addons": (["CDC STEADI 4-Stage Balance (tandem)"] if "balance_tandem_hold_s" in t else [])},
      "checkins": [{"label": h["label"], "post_op_day": h["day"], "raw_stands": h["raw"], "arms_used": h["arms"],
                    "steadi_score": 0 if h["arms"] else h["raw"]} for h in r["history"]],
      "scripted_today": {**t, "steadi_score": steadi_today},
      "expected_triage": r["expected"],
      # Patient never sees scores. Trend vs. the previous check-in picks a trauma-informed message (see plan §5).
      "monitoring_episode": {**episode_for(r), "day_in_episode": r["post_op_day"] - episode_for(r)["start_pod"],
                             "ends_after_day": 30, "on_end": "Summary to the treating clinician; clinic can reactivate"},
      "cadence": dict(zip(("next_checkin_in_days", "phase", "reason"),
                          next_checkin(episode_for(r), r["post_op_day"], r["expected"]["recommendation"], trend,
                                       sum(1 for a, b in zip(r["history"], r["history"][1:]) if b["raw"] >= a["raw"]) + (1 if trend != "harder" else 0)))),
      "patient_feedback": {"trend_vs_previous": trend, "compared_to": last["label"],
                           "next_step": r["expected"]["patient_message"]},
    })

json.dump({"generated_for": "Rise demo seed (synthetic, not for clinical use)",
           "protocol_source": "https://www.cdc.gov/steadi/media/pdfs/STEADI-Assessment-30Sec-508.pdf",
           "patients": pts}, open(out, "w"), indent=2)
for x in pts:
    print(x["rise_id"], x["display_name"], x["demographics"]["age"], x["demographics"]["sex"], x["episode"]["procedure"], "POD", x["episode"]["post_op_day_today"],
          "| today raw", x["scripted_today"]["raw"], "steadi", x["scripted_today"]["steadi_score"], "cutoff <", x["protocol"]["steadi_below_average_if_under"], "|", x["expected_triage"]["recommendation"], "| trend", x["patient_feedback"]["trend_vs_previous"], "| ep", x["monitoring_episode"]["type"], "day", x["monitoring_episode"]["day_in_episode"], "| next in", x["cadence"]["next_checkin_in_days"], x["cadence"]["reason"])
