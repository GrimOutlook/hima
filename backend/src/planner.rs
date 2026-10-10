//! Version-1 document validation. Validation never repairs or drops user data.
use chrono::NaiveDate;
use serde_json::{Map, Value};
use std::{collections::HashSet, fmt};

const MAX_ID: u64 = 9_007_199_254_740_991;
const MAX_HOURS: f64 = 1_000_000.0;
const WEEKDAYS: &[&str] = &[
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];
const TIMELINES: &[&str] = &[
    "all time",
    "±6 month",
    "YTD",
    "6 month",
    "3 month",
    "1 year",
    "5 year",
    "Previous Year",
    "YFD",
    "future 6 month",
    "future 3 month",
    "future 1 year",
    "future 5 year",
    "Next Year",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidationError(pub String);
impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}
impl std::error::Error for ValidationError {}
type Result<T> = std::result::Result<T, ValidationError>;
fn invalid(message: &str) -> ValidationError {
    ValidationError(message.into())
}
fn object<'a>(v: &'a Value, fields: &[&str]) -> Result<&'a Map<String, Value>> {
    let o = v.as_object().ok_or_else(|| invalid("Expected an object"))?;
    if o.keys().any(|k| !fields.contains(&k.as_str())) {
        return Err(invalid("Unknown document field"));
    }
    Ok(o)
}
fn array<'a>(o: &'a Map<String, Value>, key: &str) -> Result<&'a Vec<Value>> {
    let values = o
        .get(key)
        .and_then(Value::as_array)
        .ok_or_else(|| invalid(&format!("{key} must be an array")))?;
    let limit = match key {
        "pools" | "allocations" => 100,
        "recurring" | "caps" => 1000,
        "days" => 3660,
        _ => 10_000,
    };
    if values.len() > limit {
        return Err(invalid(&format!("{key} exceeds its collection limit")));
    }
    Ok(values)
}
fn text<'a>(o: &'a Map<String, Value>, key: &str) -> Result<&'a str> {
    o.get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| invalid(&format!("{key} must be a string")))
}
fn id(o: &Map<String, Value>, key: &str) -> Result<u64> {
    o.get(key)
        .and_then(Value::as_u64)
        .filter(|n| *n > 0 && *n <= MAX_ID)
        .ok_or_else(|| invalid("IDs must be positive JavaScript-safe integers"))
}
fn entry_id(o: &Map<String, Value>, ids: &mut HashSet<u64>) -> Result<()> {
    if !ids.insert(id(o, "id")?) {
        return Err(invalid("Duplicate ID within collection"));
    }
    Ok(())
}
fn name(o: &Map<String, Value>, limit: usize) -> Result<()> {
    let value = text(o, "name")?;
    if value.trim().is_empty() || value.encode_utf16().count() > limit {
        return Err(invalid(
            "Names must be nonblank and within their length limit",
        ));
    }
    Ok(())
}
fn flags(o: &Map<String, Value>, keys: &[&str]) -> Result<()> {
    if keys
        .iter()
        .any(|k| o.get(*k).is_some_and(|v| !v.is_boolean()))
    {
        return Err(invalid("Flags must be booleans"));
    }
    Ok(())
}
fn date<'a>(o: &'a Map<String, Value>, key: &str) -> Result<&'a str> {
    let s = text(o, key)?;
    if s.len() != 10
        || s.as_bytes()[4] != b'-'
        || s.as_bytes()[7] != b'-'
        || !s
            .bytes()
            .enumerate()
            .all(|(i, b)| i == 4 || i == 7 || b.is_ascii_digit())
        || !(1900..=2200).contains(&s[..4].parse::<u32>().unwrap_or(0))
        || NaiveDate::parse_from_str(s, "%Y-%m-%d").is_err()
    {
        return Err(invalid(
            "Dates must be real YYYY-MM-DD dates (years 1900–2200)",
        ));
    }
    Ok(s)
}
fn range(o: &Map<String, Value>, ordered: bool) -> Result<(&str, Option<&str>)> {
    let start = date(o, "start_date")?;
    let end = if o.contains_key("end_date") {
        Some(date(o, "end_date")?)
    } else {
        None
    };
    if ordered && end.is_some_and(|end| end < start) {
        return Err(invalid("Cap end date precedes start date"));
    }
    Ok((start, end))
}
fn amount(o: &Map<String, Value>, key: &str, zero: bool) -> Result<()> {
    let n = o
        .get(key)
        .and_then(Value::as_f64)
        .ok_or_else(|| invalid("Hours must be numbers"))?;
    let cents = n * 100.0;
    if !cents.is_finite()
        || n > MAX_HOURS
        || n < 0.0
        || (!zero && n == 0.0)
        || (cents - cents.round()).abs() > 1e-7
    {
        return Err(invalid(
            "Hours must be nonnegative hundredth-hour amounts (positive for credits and allocations)",
        ));
    }
    Ok(())
}
fn choice(o: &Map<String, Value>, key: &str, choices: &[&str]) -> Result<()> {
    if !choices.contains(&text(o, key)?) {
        return Err(invalid(&format!("Unsupported {key}")));
    }
    Ok(())
}

pub fn validate_document(v: &Value) -> Result<()> {
    let o = object(v, &["version", "pools", "events", "next_id", "settings"])?;
    if o.get("version").and_then(Value::as_u64) != Some(1) {
        return Err(invalid("Unsupported document schema version; expected 1"));
    }
    let next = id(o, "next_id")?;
    let mut largest = 0;
    let mut pool_ids = HashSet::new();
    for p in array(o, "pools")? {
        let p = object(
            p,
            &[
                "id",
                "name",
                "additions",
                "recurring",
                "caps",
                "new_additions_expire_same_day",
                "color",
                "hidden_from_graph",
                "hidden_from_total",
            ],
        )?;
        entry_id(p, &mut pool_ids)?;
        largest = largest.max(id(p, "id")?);
        name(p, 48)?;
        flags(
            p,
            &[
                "new_additions_expire_same_day",
                "hidden_from_graph",
                "hidden_from_total",
            ],
        )?;
        if p.contains_key("color") {
            let c = text(p, "color")?;
            if c.len() != 7 || !c.starts_with('#') || !c[1..].bytes().all(|b| b.is_ascii_hexdigit())
            {
                return Err(invalid("Color must be #RRGGBB"));
            }
        }
        for (key, recurring) in [("additions", false), ("recurring", true)] {
            let mut ids = HashSet::new();
            for a in array(p, key)? {
                let fields: &[&str] = if recurring {
                    &[
                        "id",
                        "amount",
                        "reset",
                        "expires_same_day",
                        "cadence",
                        "start_date",
                        "end_date",
                        "month",
                        "nth_weekday",
                        "weekday",
                    ]
                } else {
                    &["id", "amount", "reset", "expires_same_day", "date"]
                };
                let a = object(a, fields)?;
                entry_id(a, &mut ids)?;
                largest = largest.max(id(a, "id")?);
                flags(a, &["reset", "expires_same_day"])?;
                let reset = a.get("reset") == Some(&Value::Bool(true));
                amount(a, "amount", reset)?;
                if reset && a.get("expires_same_day") == Some(&Value::Bool(true)) {
                    return Err(invalid("Resets cannot expire"));
                }
                if recurring {
                    range(a, false)?;
                    choice(
                        a,
                        "cadence",
                        &[
                            "Weekly",
                            "Fortnightly",
                            "Monthly",
                            "Yearly",
                            "YearlyNthWeekday",
                        ],
                    )?;
                    if text(a, "cadence")? == "YearlyNthWeekday" {
                        if !a
                            .get("month")
                            .and_then(Value::as_u64)
                            .is_some_and(|m| (1..=12).contains(&m))
                        {
                            return Err(invalid("Month must be 1–12"));
                        }
                        choice(
                            a,
                            "nth_weekday",
                            &["First", "Second", "Third", "Fourth", "Fifth", "Last"],
                        )?;
                        choice(a, "weekday", WEEKDAYS)?;
                    } else if ["month", "nth_weekday", "weekday"]
                        .iter()
                        .any(|k| a.contains_key(*k))
                    {
                        return Err(invalid("Nth-weekday fields require YearlyNthWeekday"));
                    }
                } else {
                    date(a, "date")?;
                }
            }
        }
        let mut ids = HashSet::new();
        let mut ranges = Vec::new();
        for c in array(p, "caps")? {
            let c = object(c, &["id", "max_balance", "start_date", "end_date"])?;
            entry_id(c, &mut ids)?;
            largest = largest.max(id(c, "id")?);
            amount(c, "max_balance", true)?;
            ranges.push(range(c, true)?);
        }
        ranges.sort_unstable();
        if ranges
            .windows(2)
            .any(|w| w[0].1.is_none_or(|end| end >= w[1].0))
        {
            return Err(invalid("Cap ranges overlap"));
        }
    }
    let mut ids = HashSet::new();
    for e in array(o, "events")? {
        let e = object(e, &["id", "name", "days"])?;
        entry_id(e, &mut ids)?;
        largest = largest.max(id(e, "id")?);
        name(e, 64)?;
        let days = array(e, "days")?;
        if days.is_empty() {
            return Err(invalid("Events require days"));
        }
        let mut dates = HashSet::new();
        for d in days {
            let d = object(d, &["date", "allocations"])?;
            if !dates.insert(date(d, "date")?) {
                return Err(invalid("Duplicate date within event"));
            }
            let allocations = array(d, "allocations")?;
            if allocations.is_empty() {
                return Err(invalid("Days require allocations"));
            }
            let mut allocated_pools = HashSet::new();
            for a in allocations {
                let a = object(a, &["pool_id", "hours"])?;
                if !pool_ids.contains(&id(a, "pool_id")?) {
                    return Err(invalid("Allocation references a missing pool"));
                }
                if !allocated_pools.insert(id(a, "pool_id")?) {
                    return Err(invalid("Duplicate pool allocation within day"));
                }
                amount(a, "hours", false)?;
            }
        }
    }
    if next <= largest {
        return Err(invalid("next_id must exceed every entity ID"));
    }
    if let Some(s) = o.get("settings") {
        let s = object(s, &["firstDayOfWeek", "ignoreWeekends", "defaultTimeline"])?;
        choice(s, "firstDayOfWeek", WEEKDAYS)?;
        choice(s, "defaultTimeline", TIMELINES)?;
        if !s.get("ignoreWeekends").is_some_and(Value::is_boolean) {
            return Err(invalid("ignoreWeekends must be a boolean"));
        }
    }
    Ok(())
}
