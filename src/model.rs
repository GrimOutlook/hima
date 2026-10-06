use chrono::{Datelike, Months, NaiveDate};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(default)]
pub struct Store {
    pub pools: Vec<Pool>,
    pub events: Vec<LeaveEvent>,
    next_id: u64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct Pool {
    pub id: u64,
    pub name: String,
    pub additions: Vec<OneTimeAddition>,
    pub recurring: Vec<RecurringAddition>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct OneTimeAddition {
    pub id: u64,
    pub amount: f64,
    pub date: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct RecurringAddition {
    pub id: u64,
    pub amount: f64,
    pub cadence: Cadence,
    pub start_date: String,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
pub enum Cadence {
    Weekly,
    Fortnightly,
    Monthly,
    Yearly,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(from = "StoredLeaveEvent")]
pub struct LeaveEvent {
    pub id: u64,
    pub name: String,
    pub pool_id: u64,
    pub days: Vec<LeaveDay>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct LeaveDay {
    pub date: String,
    pub hours: f64,
}

#[derive(Deserialize)]
struct StoredLeaveEvent {
    id: u64,
    name: String,
    pool_id: u64,
    #[serde(default)]
    days: Vec<LeaveDay>,
    #[serde(default)]
    date: String,
    #[serde(default)]
    amount: f64,
}

impl From<StoredLeaveEvent> for LeaveEvent {
    fn from(stored: StoredLeaveEvent) -> Self {
        let days = if stored.days.is_empty() && !stored.date.is_empty() && stored.amount > 0.0 {
            vec![LeaveDay {
                date: stored.date,
                hours: stored.amount,
            }]
        } else {
            stored.days
        };
        Self {
            id: stored.id,
            name: stored.name,
            pool_id: stored.pool_id,
            days,
        }
    }
}

impl Cadence {
    pub fn label(self) -> &'static str {
        match self {
            Self::Weekly => "week",
            Self::Fortnightly => "fortnight",
            Self::Monthly => "month",
            Self::Yearly => "year",
        }
    }

    pub fn form_value(self) -> &'static str {
        match self {
            Self::Weekly => "weekly",
            Self::Fortnightly => "fortnightly",
            Self::Monthly => "monthly",
            Self::Yearly => "yearly",
        }
    }

    pub fn from_form(value: &str) -> Self {
        match value {
            "weekly" => Self::Weekly,
            "fortnightly" => Self::Fortnightly,
            "yearly" => Self::Yearly,
            _ => Self::Monthly,
        }
    }
}

impl Store {
    pub fn allocate_id(&mut self) -> u64 {
        let largest_existing = self
            .pools
            .iter()
            .flat_map(|pool| {
                std::iter::once(pool.id)
                    .chain(pool.additions.iter().map(|addition| addition.id))
                    .chain(pool.recurring.iter().map(|addition| addition.id))
            })
            .chain(self.events.iter().map(|event| event.id))
            .max()
            .unwrap_or(0);
        self.next_id = self.next_id.max(largest_existing.saturating_add(1)).max(1);
        let id = self.next_id;
        self.next_id = self.next_id.saturating_add(1);
        id
    }

    pub fn totals_on(&self, date: &str) -> (f64, f64, f64) {
        let accrued = self
            .pools
            .iter()
            .map(|pool| pool.accrued_on(date))
            .sum::<f64>();
        let used = self
            .events
            .iter()
            .map(|event| event.hours_through(date))
            .sum::<f64>();
        (accrued, used, accrued - used)
    }

    pub fn pool_balance_on(&self, pool_id: u64, date: &str) -> f64 {
        let accrued = self
            .pools
            .iter()
            .find(|pool| pool.id == pool_id)
            .map(|pool| pool.accrued_on(date))
            .unwrap_or(0.0);
        let used = self
            .events
            .iter()
            .filter(|event| event.pool_id == pool_id)
            .map(|event| event.hours_through(date))
            .sum::<f64>();
        accrued - used
    }
}

impl LeaveEvent {
    pub fn hours_through(&self, date: &str) -> f64 {
        self.days
            .iter()
            .filter(|day| day.date.as_str() <= date)
            .map(|day| day.hours)
            .sum()
    }

    pub fn total_hours(&self) -> f64 {
        self.days.iter().map(|day| day.hours).sum()
    }

    pub fn first_date(&self) -> &str {
        self.days
            .iter()
            .map(|day| day.date.as_str())
            .min()
            .unwrap_or_default()
    }

    pub fn last_date(&self) -> &str {
        self.days
            .iter()
            .map(|day| day.date.as_str())
            .max()
            .unwrap_or_default()
    }
}

impl Pool {
    pub fn accrued_on(&self, date: &str) -> f64 {
        let one_time = self
            .additions
            .iter()
            .filter(|addition| addition.date.as_str() <= date)
            .map(|addition| addition.amount)
            .sum::<f64>();
        let recurring = self
            .recurring
            .iter()
            .map(|addition| addition.amount * addition.occurrences_through(date) as f64)
            .sum::<f64>();
        one_time + recurring
    }
}

impl RecurringAddition {
    pub fn occurrences_through(&self, date: &str) -> i64 {
        let Some(start) = parse_date(&self.start_date) else {
            return 0;
        };
        let Some(end) = parse_date(date) else {
            return 0;
        };
        if end < start {
            return 0;
        }

        let elapsed_days = end.signed_duration_since(start).num_days();
        match self.cadence {
            Cadence::Weekly => elapsed_days / 7 + 1,
            Cadence::Fortnightly => elapsed_days / 14 + 1,
            Cadence::Monthly | Cadence::Yearly => {
                let months_per_period = if self.cadence == Cadence::Monthly {
                    1
                } else {
                    12
                };
                let elapsed_months =
                    (end.year() - start.year()) * 12 + end.month() as i32 - start.month() as i32;
                let mut periods = elapsed_months / months_per_period;

                loop {
                    let month_offset = periods * months_per_period;
                    let occurrence = start.checked_add_months(Months::new(month_offset as u32));
                    if occurrence.is_some_and(|occurrence| occurrence <= end) {
                        return periods as i64 + 1;
                    }
                    if periods == 0 {
                        return 0;
                    }
                    periods -= 1;
                }
            }
        }
    }
}

pub fn parse_date(value: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn recurring(cadence: Cadence, start_date: &str, amount: f64) -> RecurringAddition {
        RecurringAddition {
            id: 1,
            amount,
            cadence,
            start_date: start_date.to_owned(),
        }
    }

    #[test]
    fn recurring_additions_include_the_start_date_and_only_past_occurrences() {
        let rule = recurring(Cadence::Fortnightly, "2026-01-02", 3.8);

        assert_eq!(rule.occurrences_through("2026-01-01"), 0);
        assert_eq!(rule.occurrences_through("2026-01-02"), 1);
        assert_eq!(rule.occurrences_through("2026-01-30"), 3);
    }

    #[test]
    fn monthly_additions_keep_the_original_day_when_months_have_different_lengths() {
        let rule = recurring(Cadence::Monthly, "2025-01-31", 1.0);

        assert_eq!(rule.occurrences_through("2025-02-28"), 2);
        assert_eq!(rule.occurrences_through("2025-03-30"), 2);
        assert_eq!(rule.occurrences_through("2025-03-31"), 3);
    }

    #[test]
    fn dated_balance_combines_accruals_and_pool_events() {
        let store = Store {
            pools: vec![Pool {
                id: 1,
                name: "Annual leave".to_owned(),
                additions: vec![OneTimeAddition {
                    id: 2,
                    amount: 8.0,
                    date: "2026-01-01".to_owned(),
                }],
                recurring: vec![recurring(Cadence::Monthly, "2026-01-15", 2.0)],
            }],
            events: vec![LeaveEvent {
                id: 3,
                name: "Long weekend".to_owned(),
                pool_id: 1,
                days: vec![
                    LeaveDay {
                        date: "2026-02-01".to_owned(),
                        hours: 1.75,
                    },
                    LeaveDay {
                        date: "2026-02-02".to_owned(),
                        hours: 2.25,
                    },
                ],
            }],
            next_id: 4,
        };

        assert_eq!(store.totals_on("2026-01-31"), (10.0, 0.0, 10.0));
        assert_eq!(store.totals_on("2026-02-01"), (10.0, 1.75, 8.25));
        assert_eq!(store.totals_on("2026-02-02"), (10.0, 4.0, 6.0));
        assert_eq!(store.pool_balance_on(1, "2026-02-01"), 8.25);
    }

    #[test]
    fn old_single_day_events_migrate_to_a_daily_breakdown() {
        let old_event = r#"{
            "id": 8,
            "name": "Doctor appointment",
            "pool_id": 2,
            "date": "2026-04-15",
            "amount": 1.5
        }"#;

        let event: LeaveEvent = serde_json::from_str(old_event).unwrap();

        assert_eq!(
            event.days,
            vec![LeaveDay {
                date: "2026-04-15".to_owned(),
                hours: 1.5,
            }]
        );
        assert_eq!(event.total_hours(), 1.5);

        let saved = serde_json::to_value(event).unwrap();
        assert!(saved.get("days").is_some());
        assert!(saved.get("date").is_none());
        assert!(saved.get("amount").is_none());
    }
}
