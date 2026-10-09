use hima_api::planner::validate_document;
use serde_json::{Value, json};

pub fn document() -> Value {
    json!({"version":1,"next_id":6,"pools":[{"id":1,"name":"Leave","color":"#abcdef","hidden_from_graph":false,"additions":[{"id":2,"amount":0,"reset":true,"date":"2026-01-01"}],"recurring":[{"id":3,"amount":1.25,"cadence":"YearlyNthWeekday","start_date":"2026-01-01","month":2,"nth_weekday":"Last","weekday":"Monday"}],"caps":[{"id":4,"max_balance":100,"start_date":"2026-01-01"}]}],"events":[{"id":5,"name":"Trip","days":[{"date":"2026-02-28","allocations":[{"pool_id":1,"hours":0.29}]}]}],"settings":{"firstDayOfWeek":"Monday","ignoreWeekends":false,"defaultTimeline":"±6 month"}})
}

#[test]
fn version_one_compatibility() {
    let mut v = document();
    validate_document(&v).unwrap();
    v.as_object_mut().unwrap().remove("settings");
    validate_document(&v).unwrap();
    // Frontend normalization deduplicates within collections, not globally.
    v["events"][0]["id"] = json!(1);
    validate_document(&v).unwrap();
    // Version-1 normalization permits an already-ended recurring schedule.
    v["pools"][0]["recurring"][0]["end_date"] = json!("2025-01-01");
    validate_document(&v).unwrap();
}

#[test]
fn invalid_documents_are_rejected_without_mutation() {
    let cases = [
        ("/version", json!(2)),
        ("/version", Value::Null),
        ("/next_id", json!(5)),
        ("/next_id", json!(9007199254740992_u64)),
        ("/pools", json!({})),
        ("/pools/0/name", json!(" ")),
        ("/pools/0/color", json!("#zzzzzz")),
        ("/pools/0/hidden_from_graph", json!(1)),
        ("/pools/0/additions/0/date", json!("2026-02-29")),
        ("/pools/0/additions/0/date", json!("2026-1-01")),
        ("/pools/0/additions/0/amount", json!(-1)),
        ("/pools/0/additions/0/amount", json!("1")),
        ("/pools/0/additions/0/amount", json!(0.001)),
        ("/pools/0/additions/0/reset", json!(false)),
        ("/pools/0/recurring/0/cadence", json!("weekly")),
        ("/pools/0/recurring/0/month", json!(13)),
        ("/pools/0/recurring/0/nth_weekday", json!("Sixth")),
        ("/pools/0/caps/0/end_date", json!("2025-01-01")),
        ("/events/0/days", json!([])),
        ("/events/0/days/0/allocations/0/pool_id", json!(9)),
        ("/events/0/days/0/allocations/0/hours", json!(0)),
        ("/settings/ignoreWeekends", Value::Null),
        ("/settings/defaultTimeline", json!("bogus")),
    ];
    for (path, value) in cases {
        let mut v = document();
        if let Some(target) = v.pointer_mut(path) {
            *target = value;
        } else {
            v["pools"][0]["caps"][0]["end_date"] = value;
        }
        let before = v.clone();
        assert!(validate_document(&v).is_err(), "accepted {path}: {v}");
        assert_eq!(v, before);
    }
    let mut v = document();
    v["unexpected"] = json!(true);
    assert!(validate_document(&v).is_err());
    let mut v = document();
    let duplicate = v["pools"][0].clone();
    v["pools"].as_array_mut().unwrap().push(duplicate);
    assert!(validate_document(&v).is_err());
    let mut v = document();
    let mut cap = v["pools"][0]["caps"][0].clone();
    cap["id"] = json!(2);
    v["pools"][0]["caps"].as_array_mut().unwrap().push(cap);
    assert!(validate_document(&v).is_err());
}
