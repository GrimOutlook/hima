//! Version-1 document validation. Validation never repairs or drops user data.
use chrono::NaiveDate;
use serde_json::{Map, Value};
use std::{collections::HashSet, fmt};

const MAX_ID: u64 = 9_007_199_254_740_991;
const MAX_HOURS: f64 = 1_000_000.0;
const MAX_POOL_NAME_LENGTH: usize = 48;
const MAX_EVENT_NAME_LENGTH: usize = 64;
const MAX_POOLS_AND_ALLOCATIONS: usize = 100;
const MAX_RECURRING_AND_CAPS: usize = 1000;
const MAX_EVENT_DAYS: usize = 3660;
const MAX_COLLECTION_ENTRIES: usize = 10_000;
const CADENCES: &[&str] = &[
    "Weekly",
    "Fortnightly",
    "Monthly",
    "Yearly",
    "YearlyNthWeekday",
];
const NTH_WEEKDAYS: &[&str] = &["First", "Second", "Third", "Fourth", "Fifth", "Last"];
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
fn object<'a>(value: &'a Value, fields: &[&str]) -> Result<&'a Map<String, Value>> {
    let fields_map = value
        .as_object()
        .ok_or_else(|| invalid("Expected an object"))?;
    if fields_map.keys().any(|key| !fields.contains(&key.as_str())) {
        return Err(invalid("Unknown document field"));
    }
    Ok(fields_map)
}
fn array<'a>(fields: &'a Map<String, Value>, key: &str) -> Result<&'a Vec<Value>> {
    let values = fields
        .get(key)
        .and_then(Value::as_array)
        .ok_or_else(|| invalid(&format!("{key} must be an array")))?;
    let limit = match key {
        "pools" | "allocations" => MAX_POOLS_AND_ALLOCATIONS,
        "recurring" | "caps" => MAX_RECURRING_AND_CAPS,
        "days" => MAX_EVENT_DAYS,
        _ => MAX_COLLECTION_ENTRIES,
    };
    if values.len() > limit {
        return Err(invalid(&format!("{key} exceeds its collection limit")));
    }
    Ok(values)
}
fn text<'a>(fields: &'a Map<String, Value>, key: &str) -> Result<&'a str> {
    fields
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| invalid(&format!("{key} must be a string")))
}
fn id(fields: &Map<String, Value>, key: &str) -> Result<u64> {
    fields
        .get(key)
        .and_then(Value::as_u64)
        .filter(|value| *value > 0 && *value <= MAX_ID)
        .ok_or_else(|| invalid("IDs must be positive JavaScript-safe integers"))
}
fn entry_id(entry: &Map<String, Value>, ids: &mut HashSet<u64>) -> Result<u64> {
    let entry_id = id(entry, "id")?;
    if !ids.insert(entry_id) {
        return Err(invalid("Duplicate ID within collection"));
    }
    Ok(entry_id)
}
fn name(fields: &Map<String, Value>, limit: usize) -> Result<()> {
    let value = text(fields, "name")?;
    if value.trim().is_empty() || value.encode_utf16().count() > limit {
        return Err(invalid(
            "Names must be nonblank and within their length limit",
        ));
    }
    Ok(())
}
fn flags(fields: &Map<String, Value>, keys: &[&str]) -> Result<()> {
    if keys
        .iter()
        .any(|key| fields.get(*key).is_some_and(|value| !value.is_boolean()))
    {
        return Err(invalid("Flags must be booleans"));
    }
    Ok(())
}
fn date<'a>(fields: &'a Map<String, Value>, key: &str) -> Result<&'a str> {
    let value = text(fields, key)?;
    if value.len() != 10
        || value.as_bytes()[4] != b'-'
        || value.as_bytes()[7] != b'-'
        || !value
            .bytes()
            .enumerate()
            .all(|(index, byte)| index == 4 || index == 7 || byte.is_ascii_digit())
        || !(1900..=2200).contains(&value[..4].parse::<u32>().unwrap_or(0))
        || NaiveDate::parse_from_str(value, "%Y-%m-%d").is_err()
    {
        return Err(invalid(
            "Dates must be real YYYY-MM-DD dates (years 1900–2200)",
        ));
    }
    Ok(value)
}
fn range(fields: &Map<String, Value>, ordered: bool) -> Result<(&str, Option<&str>)> {
    let start = date(fields, "start_date")?;
    let end = if fields.contains_key("end_date") {
        Some(date(fields, "end_date")?)
    } else {
        None
    };
    if ordered && end.is_some_and(|end| end < start) {
        return Err(invalid("Cap end date precedes start date"));
    }
    Ok((start, end))
}
fn amount(fields: &Map<String, Value>, key: &str, zero: bool) -> Result<()> {
    let hours = fields
        .get(key)
        .and_then(Value::as_f64)
        .ok_or_else(|| invalid("Hours must be numbers"))?;
    let cents = hours * 100.0;
    if !cents.is_finite()
        || hours > MAX_HOURS
        || hours < 0.0
        || (!zero && hours == 0.0)
        || (cents - cents.round()).abs() > 1e-7
    {
        return Err(invalid(
            "Hours must be nonnegative hundredth-hour amounts (positive for credits and allocations)",
        ));
    }
    Ok(())
}
fn choice(fields: &Map<String, Value>, key: &str, choices: &[&str]) -> Result<()> {
    if !choices.contains(&text(fields, key)?) {
        return Err(invalid(&format!("Unsupported {key}")));
    }
    Ok(())
}

pub fn validate_document(document: &Value) -> Result<()> {
    let document = object(
        document,
        &["version", "pools", "events", "next_id", "settings"],
    )?;
    if document.get("version").and_then(Value::as_u64) != Some(1) {
        return Err(invalid("Unsupported document schema version; expected 1"));
    }
    let next = id(document, "next_id")?;
    let mut largest = 0;
    let mut pool_ids = HashSet::new();
    for pool in array(document, "pools")? {
        validate_pool(pool, &mut pool_ids, &mut largest)?;
    }
    let mut event_ids = HashSet::new();
    for event in array(document, "events")? {
        validate_event(event, &pool_ids, &mut event_ids, &mut largest)?;
    }
    if next <= largest {
        return Err(invalid("next_id must exceed every entity ID"));
    }
    if let Some(settings) = document.get("settings") {
        validate_settings(settings)?;
    }
    Ok(())
}

fn validate_pool(value: &Value, pool_ids: &mut HashSet<u64>, largest: &mut u64) -> Result<()> {
    let pool = object(
        value,
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
    *largest = (*largest).max(entry_id(pool, pool_ids)?);
    name(pool, MAX_POOL_NAME_LENGTH)?;
    flags(
        pool,
        &[
            "new_additions_expire_same_day",
            "hidden_from_graph",
            "hidden_from_total",
        ],
    )?;
    if pool.contains_key("color") {
        let color = text(pool, "color")?;
        if color.len() != 7
            || !color.starts_with('#')
            || !color[1..].bytes().all(|byte| byte.is_ascii_hexdigit())
        {
            return Err(invalid("Color must be #RRGGBB"));
        }
    }
    for (key, recurring) in [("additions", false), ("recurring", true)] {
        let mut ids = HashSet::new();
        for addition in array(pool, key)? {
            validate_addition(addition, recurring, &mut ids, largest)?;
        }
    }
    validate_caps(pool, largest)?;
    Ok(())
}

fn validate_addition(
    value: &Value,
    recurring: bool,
    ids: &mut HashSet<u64>,
    largest: &mut u64,
) -> Result<()> {
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
    let addition = object(value, fields)?;
    *largest = (*largest).max(entry_id(addition, ids)?);
    flags(addition, &["reset", "expires_same_day"])?;
    let reset = addition.get("reset") == Some(&Value::Bool(true));
    amount(addition, "amount", reset)?;
    if reset && addition.get("expires_same_day") == Some(&Value::Bool(true)) {
        return Err(invalid("Resets cannot expire"));
    }
    if recurring {
        range(addition, false)?;
        choice(addition, "cadence", CADENCES)?;
        if text(addition, "cadence")? == "YearlyNthWeekday" {
            if !addition
                .get("month")
                .and_then(Value::as_u64)
                .is_some_and(|month| (1..=12).contains(&month))
            {
                return Err(invalid("Month must be 1–12"));
            }
            choice(addition, "nth_weekday", NTH_WEEKDAYS)?;
            choice(addition, "weekday", WEEKDAYS)?;
        } else if ["month", "nth_weekday", "weekday"]
            .iter()
            .any(|key| addition.contains_key(*key))
        {
            return Err(invalid("Nth-weekday fields require YearlyNthWeekday"));
        }
    } else {
        date(addition, "date")?;
    }
    Ok(())
}

fn validate_caps(pool: &Map<String, Value>, largest: &mut u64) -> Result<()> {
    let mut ids = HashSet::new();
    let mut ranges = Vec::new();
    for cap in array(pool, "caps")? {
        let cap = object(cap, &["id", "max_balance", "start_date", "end_date"])?;
        *largest = (*largest).max(entry_id(cap, &mut ids)?);
        amount(cap, "max_balance", true)?;
        ranges.push(range(cap, true)?);
    }
    ranges.sort_unstable();
    if ranges
        .windows(2)
        .any(|window| window[0].1.is_none_or(|end| end >= window[1].0))
    {
        return Err(invalid("Cap ranges overlap"));
    }
    Ok(())
}

fn validate_event(
    value: &Value,
    pool_ids: &HashSet<u64>,
    ids: &mut HashSet<u64>,
    largest: &mut u64,
) -> Result<()> {
    let event = object(value, &["id", "name", "days"])?;
    *largest = (*largest).max(entry_id(event, ids)?);
    name(event, MAX_EVENT_NAME_LENGTH)?;
    let days = array(event, "days")?;
    if days.is_empty() {
        return Err(invalid("Events require days"));
    }
    let mut dates = HashSet::new();
    for day in days {
        let day = object(day, &["date", "allocations"])?;
        if !dates.insert(date(day, "date")?) {
            return Err(invalid("Duplicate date within event"));
        }
        let allocations = array(day, "allocations")?;
        if allocations.is_empty() {
            return Err(invalid("Days require allocations"));
        }
        let mut allocated_pools = HashSet::new();
        for allocation in allocations {
            let allocation = object(allocation, &["pool_id", "hours"])?;
            let pool_id = id(allocation, "pool_id")?;
            if !pool_ids.contains(&pool_id) {
                return Err(invalid("Allocation references a missing pool"));
            }
            if !allocated_pools.insert(pool_id) {
                return Err(invalid("Duplicate pool allocation within day"));
            }
            amount(allocation, "hours", false)?;
        }
    }
    Ok(())
}

fn validate_settings(value: &Value) -> Result<()> {
    let settings = object(
        value,
        &["firstDayOfWeek", "ignoreWeekends", "defaultTimeline"],
    )?;
    choice(settings, "firstDayOfWeek", WEEKDAYS)?;
    choice(settings, "defaultTimeline", TIMELINES)?;
    if !settings
        .get("ignoreWeekends")
        .is_some_and(Value::is_boolean)
    {
        return Err(invalid("ignoreWeekends must be a boolean"));
    }
    Ok(())
}
