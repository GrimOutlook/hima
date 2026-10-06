mod model;

use chrono::{Months, NaiveDate};
use dioxus::prelude::*;
use model::{
    parse_date, Cadence, LeaveDay, LeaveEvent, OneTimeAddition, Pool, PoolAllocation,
    RecurringAddition, Store,
};
use std::collections::HashSet;

#[cfg(target_arch = "wasm32")]
const STORAGE_KEY: &str = "hima.store.v1";

#[derive(Clone, Copy, PartialEq)]
enum Modal {
    None,
    NewPool,
    EditPool { pool_id: u64 },
    AddTime { pool_id: u64 },
    EditAddition { pool_id: u64, addition_id: u64 },
    EditRecurring { pool_id: u64, rule_id: u64 },
    NewEvent,
    EditEvent { event_id: u64 },
}

#[derive(Clone, Debug, PartialEq)]
struct EventDayInput {
    date: String,
    allocations: Vec<PoolAllocationInput>,
}

#[derive(Clone, Debug, PartialEq)]
struct PoolAllocationInput {
    pool_id: u64,
    hours: String,
}

impl EventDayInput {
    fn new(date: String, pool_id: u64) -> Self {
        Self {
            date,
            allocations: vec![PoolAllocationInput {
                pool_id,
                hours: String::new(),
            }],
        }
    }
}

struct BalancePoint {
    date: NaiveDate,
    balance: f64,
    projected: bool,
}

struct ChartTick {
    y: f64,
    label: String,
    is_zero: bool,
}

struct ChartDateLabel {
    x: f64,
    label: String,
    anchor: &'static str,
}

struct BalanceChart {
    history_line_path: String,
    history_area_path: String,
    projection_line_path: String,
    projection_area_path: String,
    ticks: Vec<ChartTick>,
    date_labels: Vec<ChartDateLabel>,
    zero_y: Option<f64>,
    today_x: f64,
    width: f64,
    today_y: f64,
    projection_x: f64,
    projection_y: f64,
}

fn main() {
    dioxus::launch(App);
}

#[allow(non_snake_case)]
fn App() -> Element {
    let mut store = use_signal(load_store);
    let state = store.read().clone();
    let mut balance_date = use_signal(today_date);
    let mut modal = use_signal(|| Modal::None);

    let mut form_error = use_signal(String::new);
    let mut pool_name = use_signal(String::new);
    let mut opening_amount = use_signal(String::new);
    let mut opening_date = use_signal(today_date);
    let mut contribution_amount = use_signal(String::new);
    let mut contribution_date = use_signal(today_date);
    let mut contribution_is_recurring = use_signal(|| false);
    let mut contribution_cadence = use_signal(|| "fortnightly".to_owned());
    let mut event_name = use_signal(String::new);
    let mut event_days = use_signal(|| fresh_event_days(0));

    use_effect(move || {
        let snapshot = store.read().clone();
        save_store(&snapshot);
    });

    let selected_date = balance_date();
    let (accrued, used, balance) = state.totals_on(&selected_date);
    let history_end = today_date();
    let history = balance_history(&state, &history_end);
    let history_chart = chart_layout(&history);
    let history_start_balance = history.first().map(|point| point.balance).unwrap_or(0.0);
    let history_current_balance = history
        .iter()
        .rev()
        .find(|point| !point.projected)
        .map(|point| point.balance)
        .unwrap_or_default();
    let history_projected_balance = history
        .last()
        .map(|point| point.balance)
        .unwrap_or_default();
    let history_change = history_current_balance - history_start_balance;
    let history_start_date = history
        .first()
        .map(|point| point.date.format("%b %d, %Y").to_string())
        .unwrap_or_else(|| history_end.clone());
    let history_forecast_end = history
        .last()
        .map(|point| point.date.format("%b %d, %Y").to_string())
        .unwrap_or_else(|| history_end.clone());

    let scroll_to_today = history_chart.today_x;
    use_effect(move || {
        spawn(async move {
            let script = format!(
                r#"const chart = document.getElementById("balance-chart-scroll");
                if (chart) chart.scrollLeft = Math.max(0, {scroll_to_today} - chart.clientWidth / 2);"#
            );
            let _ = document::eval(&script).await;
        });
    });
    let first_pool_id = state.pools.first().map(|pool| pool.id);
    let mut timeline = state.events.clone();
    timeline.sort_by(|left, right| left.first_date().cmp(right.first_date()));
    let event_word = plural(timeline.len(), "event", "events");
    let current_modal = modal();
    let editing_pool_id = match current_modal {
        Modal::EditPool { pool_id } => Some(pool_id),
        _ => None,
    };
    let editing_event_id = match current_modal {
        Modal::EditEvent { event_id } => Some(event_id),
        _ => None,
    };
    let contribution_pool_id = match current_modal {
        Modal::AddTime { pool_id }
        | Modal::EditAddition { pool_id, .. }
        | Modal::EditRecurring { pool_id, .. } => Some(pool_id),
        _ => None,
    };
    let is_adding_time = matches!(current_modal, Modal::AddTime { .. });

    rsx! {
        document::Stylesheet { href: asset!("/assets/main.css") }

        div { class: "app-shell",
            header { class: "topbar",
                a { class: "brand", href: "#top", aria_label: "hima home",
                    span { class: "brand-mark", "h" }
                    span { class: "brand-name", "hima" }
                }
                div { class: "topbar-right",
                    span { class: "privacy-note",
                        span { class: "privacy-dot" }
                        "Saved on this device"
                    }
                    button {
                        class: "button button-primary",
                        onclick: move |_| {
                            form_error.set(String::new());
                            pool_name.set(String::new());
                            opening_amount.set(String::new());
                            opening_date.set(today_date());
                            modal.set(Modal::NewPool);
                        },
                        span { class: "button-plus", "+" }
                        "New pool"
                    }
                }
            }

            main { id: "top", class: "page-content",
                section { class: "page-intro",
                    div { class: "eyebrow", "A LITTLE MORE ROOM TO BREATHE" }
                    h1 { "Your time, in good hands." }
                    p { "Plan personal leave with a clear picture of what you've saved and what's ahead." }
                }

                section { class: "balance-card",
                    div { class: "balance-topline",
                        div { class: "balance-main",
                            div { class: "balance-kicker", "PROJECTED PPL BALANCE" }
                            div {
                                class: if balance < 0.0 { "balance-number is-negative" } else { "balance-number" },
                                "{format_hours(balance)}"
                                span { class: "balance-unit", "hours" }
                            }
                        }
                        label { class: "date-picker",
                            span { "BALANCE ON" }
                            input {
                                r#type: "date",
                                value: "{selected_date}",
                                oninput: move |event| balance_date.set(event.value()),
                            }
                        }
                    }
                    div { class: "balance-divider" }
                    div { class: "balance-breakdown",
                        div { class: "breakdown-item",
                            span { class: "breakdown-icon icon-in", "↗" }
                            span { class: "breakdown-label", "Accrued by this date" }
                            strong { "{format_hours(accrued)} h" }
                        }
                        div { class: "breakdown-item",
                            span { class: "breakdown-icon icon-out", "↘" }
                            span { class: "breakdown-label", "Planned leave by this date" }
                            strong { "{format_hours(used)} h" }
                        }
                        div { class: "balance-hint", "All amounts are in hours" }
                    }
                }

                div { class: "section-heading-row",
                    div {
                        div { class: "section-overline", "THE BIG PICTURE" }
                        h2 { "Your pools" }
                    }
                    span { class: "as-of-label", "Balances as of {pretty_date(&selected_date)}" }
                }

                div { class: "workspace-grid",
                    section { class: "pools-column", aria_label: "Leave pools",
                        if state.pools.is_empty() {
                            div { class: "empty-card pool-empty",
                                div { class: "empty-illustration", "✳" }
                                h3 { "Start with a pool" }
                                p { "Give your leave a home. Add a one-off balance now, or set up regular accruals as you go." }
                                button {
                                    class: "button button-primary",
                                    onclick: move |_| {
                                        form_error.set(String::new());
                                        pool_name.set(String::new());
                                        opening_amount.set(String::new());
                                        opening_date.set(today_date());
                                        modal.set(Modal::NewPool);
                                    },
                                    span { class: "button-plus", "+" }
                                    "Create your first pool"
                                }
                            }
                        } else {
                            for pool in state.pools.iter() {
                                {
                                    let pool_id = pool.id;
                                    let pool_balance = state.pool_balance_on(pool_id, &selected_date);
                                    let pool_name_for_edit = pool.name.clone();
                                    let pool_name_for_delete = pool.name.clone();
                                    rsx! {
                                        article { class: "pool-card", key: "pool-{pool_id}",
                                            div { class: "pool-card-header",
                                                div { class: "pool-title-group",
                                                    div { class: "pool-icon", "◌" }
                                                    div {
                                                        h3 { "{pool.name}" }
                                                        div { class: "pool-subtitle", "Personal leave pool" }
                                                    }
                                                }
                                                div { class: "pool-actions",
                                                    button {
                                                        class: "icon-button",
                                                        title: "Edit pool",
                                                        aria_label: "Edit {pool.name}",
                                                        onclick: move |_| {
                                                            pool_name.set(pool_name_for_edit.clone());
                                                            form_error.set(String::new());
                                                            modal.set(Modal::EditPool { pool_id });
                                                        },
                                                        "✎"
                                                    }
                                                    button {
                                                        class: "icon-button delete-button",
                                                        title: "Delete pool",
                                                        aria_label: "Delete {pool.name}",
                                                        onclick: move |_| {
                                                            if confirm_delete(&format!("Remove ‘{pool_name_for_delete}’ and event days assigned to it?")) {
                                                                let mut data = store.write();
                                                                data.pools.retain(|candidate| candidate.id != pool_id);
                                                                for event in &mut data.events {
                                                                    for day in &mut event.days {
                                                                        day.allocations.retain(|allocation| allocation.pool_id != pool_id);
                                                                    }
                                                                    event.days.retain(|day| !day.allocations.is_empty());
                                                                }
                                                                data.events.retain(|event| !event.days.is_empty());
                                                            }
                                                        },
                                                        "×"
                                                    }
                                                }
                                            }
                                            div {
                                                class: if pool_balance < 0.0 { "pool-balance pool-balance-negative" } else { "pool-balance" },
                                                "{format_hours(pool_balance)}"
                                                span { "h" }
                                            }
                                            div { class: "pool-balance-caption", "available on {pretty_date(&selected_date)}" }

                                            div { class: "pool-rules",
                                                if pool.additions.is_empty() && pool.recurring.is_empty() {
                                                    p { class: "no-rules", "No time added yet. Add a balance or set a schedule." }
                                                } else {
                                                    for rule in pool.recurring.iter() {
                                                        {
                                                            let rule_id = rule.id;
                                                            let rule_amount = rule.amount;
                                                            let rule_start_date = rule.start_date.clone();
                                                            let rule_cadence = rule.cadence;
                                                            rsx! {
                                                                div { class: "rule-row", key: "recurring-{rule_id}",
                                                                    span { class: "rule-symbol recurring-symbol", "↻" }
                                                                    span { class: "rule-copy", "+{format_hours(rule_amount)} h every {rule_cadence.label()}" }
                                                                    span { class: "rule-date", "from {pretty_date(&rule_start_date)}" }
                                                                    div { class: "rule-actions",
                                                                        button {
                                                                            class: "icon-button",
                                                                            title: "Edit recurring addition",
                                                                            aria_label: "Edit recurring addition",
                                                                            onclick: move |_| {
                                                                                contribution_amount.set(format_hours(rule_amount));
                                                                                contribution_date.set(rule_start_date.clone());
                                                                                contribution_cadence.set(rule_cadence.form_value().to_owned());
                                                                                contribution_is_recurring.set(true);
                                                                                form_error.set(String::new());
                                                                                modal.set(Modal::EditRecurring { pool_id, rule_id });
                                                                            },
                                                                            "✎"
                                                                        }
                                                                        button {
                                                                            class: "icon-button rule-delete",
                                                                            title: "Delete recurring addition",
                                                                            aria_label: "Delete recurring addition",
                                                                            onclick: move |_| {
                                                                                if confirm_delete("Remove this recurring addition?") {
                                                                                    if let Some(pool) = store.write().pools.iter_mut().find(|pool| pool.id == pool_id) {
                                                                                        pool.recurring.retain(|candidate| candidate.id != rule_id);
                                                                                    }
                                                                                }
                                                                            },
                                                                            "×"
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                    for addition in pool.additions.iter().rev() {
                                                        {
                                                            let addition_id = addition.id;
                                                            let addition_amount = addition.amount;
                                                            let addition_date = addition.date.clone();
                                                            rsx! {
                                                                div { class: "rule-row", key: "addition-{addition_id}",
                                                                    span { class: "rule-symbol one-time-symbol", "+" }
                                                                    span { class: "rule-copy", "+{format_hours(addition_amount)} h one-time" }
                                                                    span { class: "rule-date", "on {pretty_date(&addition_date)}" }
                                                                    div { class: "rule-actions",
                                                                        button {
                                                                            class: "icon-button",
                                                                            title: "Edit one-time addition",
                                                                            aria_label: "Edit one-time addition",
                                                                            onclick: move |_| {
                                                                                contribution_amount.set(format_hours(addition_amount));
                                                                                contribution_date.set(addition_date.clone());
                                                                                contribution_is_recurring.set(false);
                                                                                form_error.set(String::new());
                                                                                modal.set(Modal::EditAddition { pool_id, addition_id });
                                                                            },
                                                                            "✎"
                                                                        }
                                                                        button {
                                                                            class: "icon-button rule-delete",
                                                                            title: "Delete one-time addition",
                                                                            aria_label: "Delete one-time addition",
                                                                            onclick: move |_| {
                                                                                if confirm_delete("Remove this one-time addition?") {
                                                                                    if let Some(pool) = store.write().pools.iter_mut().find(|pool| pool.id == pool_id) {
                                                                                        pool.additions.retain(|candidate| candidate.id != addition_id);
                                                                                    }
                                                                                }
                                                                            },
                                                                            "×"
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }

                                            div { class: "pool-card-footer",
                                                span { class: "pool-unit-note", "Tracked in hours" }
                                                button {
                                                    class: "button button-soft button-small",
                                                    onclick: move |_| {
                                                        form_error.set(String::new());
                                                        contribution_amount.set(String::new());
                                                        contribution_date.set(today_date());
                                                        contribution_is_recurring.set(false);
                                                        modal.set(Modal::AddTime { pool_id });
                                                    },
                                                    span { class: "button-plus", "+" }
                                                    "Add time"
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    section { class: "events-column", aria_label: "Planned leave events",
                        div { class: "events-panel",
                            div { class: "events-panel-header",
                                div {
                                    div { class: "section-overline", "MAKE SPACE FOR LIFE" }
                                    h2 { "Planned leave" }
                                }
                                button {
                                    class: "button button-outline button-small",
                                    disabled: state.pools.is_empty(),
                                    onclick: move |_| {
                                        form_error.set(String::new());
                                        event_name.set(String::new());
                                        event_days.set(fresh_event_days(first_pool_id.unwrap_or_default()));
                                        modal.set(Modal::NewEvent);
                                    },
                                    span { class: "button-plus", "+" }
                                    "Add event"
                                }
                            }
                            p { class: "events-caption", "Each event day draws from its selected pool." }

                            if timeline.is_empty() {
                                div { class: "events-empty",
                                    span { class: "events-empty-mark", "↗" }
                                    p { "Your plans will show up here." }
                                    if state.pools.is_empty() {
                                        span { class: "events-empty-subtitle", "Create a pool first to log leave." }
                                    } else {
                                        button {
                                            class: "text-button",
                                            onclick: move |_| {
                                                form_error.set(String::new());
                                                event_name.set(String::new());
                                                event_days.set(fresh_event_days(first_pool_id.unwrap_or_default()));
                                                modal.set(Modal::NewEvent);
                                            },
                                            "Add your first event →"
                                        }
                                    }
                                }
                            } else {
                                div { class: "timeline-list",
                                    for event in timeline.iter() {
                                        {
                                            let event_id = event.id;
                                            let event_included_days = event
                                                .days
                                                .iter()
                                                .filter(|day| day.date.as_str() <= selected_date.as_str())
                                                .count();
                                            let event_status_class = if event_included_days == event.days.len() {
                                                "event-status event-status-counted"
                                            } else if event_included_days > 0 {
                                                "event-status event-status-partial"
                                            } else {
                                                "event-status"
                                            };
                                            let event_status_label = if event_included_days == event.days.len() {
                                                "Included in balance"
                                            } else if event_included_days > 0 {
                                                "Partly included"
                                            } else {
                                                "After selected date"
                                            };
                                            let event_name_for_edit = event.name.clone();
                                            let event_days_for_edit = event.days.iter()
                                                .map(|day| EventDayInput {
                                                    date: day.date.clone(),
                                                    allocations: day.allocations.iter()
                                                        .map(|allocation| PoolAllocationInput {
                                                            pool_id: allocation.pool_id,
                                                            hours: format_hours(allocation.hours),
                                                        })
                                                        .collect(),
                                                })
                                                .collect::<Vec<_>>();
                                            let event_first_date = event.first_date().to_owned();
                                            let event_date_range = event_date_range_label(event);
                                            let event_day_count = event.days.len();
                                            let event_day_word = plural(event_day_count, "day", "days");
                                            let event_day_summary = event_day_summary(event, &state.pools);
                                            let event_pool_summary = event_pool_summary(event, &state.pools);
                                            rsx! {
                                                article { class: "event-row", key: "event-{event_id}",
                                                    div { class: "event-date-block",
                                                        span { class: "event-month", "{month_label(&event_first_date)}" }
                                                        strong { "{day_label(&event_first_date)}" }
                                                    }
                                                    div { class: "event-info",
                                                        strong { "{event.name}" }
                                                        span { "{event_pool_summary} · {event_day_count} {event_day_word} · {event_date_range}" }
                                                        span { class: "event-day-details", "{event_day_summary}" }
                                                        span {
                                                            class: event_status_class,
                                                            "{event_status_label}"
                                                        }
                                                    }
                                                    div { class: "event-amount", "−{format_hours(event.total_hours())} h" }
                                                    div { class: "event-actions",
                                                        button {
                                                            class: "icon-button",
                                                            title: "Edit event",
                                                            aria_label: "Edit {event.name}",
                                                            onclick: move |_| {
                                                                event_name.set(event_name_for_edit.clone());
                                                                event_days.set(event_days_for_edit.clone());
                                                                form_error.set(String::new());
                                                                modal.set(Modal::EditEvent { event_id });
                                                            },
                                                            "✎"
                                                        }
                                                        button {
                                                            class: "icon-button event-delete",
                                                            title: "Delete event",
                                                            aria_label: "Delete {event.name}",
                                                            onclick: move |_| store.write().events.retain(|item| item.id != event_id),
                                                            "×"
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            div { class: "events-panel-footer",
                                span { "{timeline.len()} {event_word}" }
                                span { "{format_hours(used)} h used by selected date" }
                            }
                        }
                    }
                }

                section { class: "history-panel",
                    div { class: "history-panel-header",
                        div {
                            div { class: "section-overline", "A YEAR AT A GLANCE" }
                            h2 { "PPL balance history & outlook" }
                            p { "Past year and twelve-month projection across all pools." }
                        }
                        div { class: "history-metrics",
                            div { class: "history-change",
                                strong {
                                    class: if history_change < 0.0 { "history-change-negative" } else { "" },
                                    "{format_signed_hours(history_change)} h"
                                }
                                span { "change over past year" }
                            }
                            div { class: "history-projection",
                                strong { "{format_hours(history_projected_balance)} h" }
                                span { "projected in twelve months" }
                            }
                        }
                    }
                    div { class: "balance-chart-wrap",
                        div { id: "balance-chart-scroll", class: "balance-chart-scroll",
                            svg {
                                class: "balance-chart-svg",
                                width: "{history_chart.width}",
                                height: "290",
                                view_box: "0 0 {history_chart.width} 290",
                                role: "img",
                                title { "Daily combined PPL balance and forecast for the past and coming year" }
                                path { class: "history-area", d: "{history_chart.history_area_path}" }
                                path { class: "projection-area", d: "{history_chart.projection_area_path}" }
                                for tick in history_chart.ticks.iter() {
                                    line {
                                        class: if tick.is_zero { "chart-grid chart-grid-zero" } else { "chart-grid" },
                                        x1: "68",
                                        x2: "{history_chart.width - 18.0}",
                                        y1: "{tick.y:.2}",
                                        y2: "{tick.y:.2}",
                                    }
                                    text {
                                        class: "chart-y-label",
                                        x: "60",
                                        y: "{tick.y + 4.0:.2}",
                                        text_anchor: "end",
                                        "{tick.label}"
                                    }
                                }
                                if let Some(zero_y) = history_chart.zero_y {
                                    line {
                                        class: "chart-grid chart-grid-zero",
                                        x1: "68",
                                        x2: "{history_chart.width - 18.0}",
                                        y1: "{zero_y:.2}",
                                        y2: "{zero_y:.2}",
                                    }
                                }
                                line {
                                    class: "chart-today-line",
                                    x1: "{history_chart.today_x:.2}",
                                    x2: "{history_chart.today_x:.2}",
                                    y1: "18",
                                    y2: "232",
                                }
                                text {
                                    class: "chart-today-label",
                                    x: "{history_chart.today_x:.2}",
                                    y: "13",
                                    text_anchor: "middle",
                                    "Today"
                                }
                                path { class: "history-line", d: "{history_chart.history_line_path}" }
                                path { class: "projection-line", d: "{history_chart.projection_line_path}" }
                                circle {
                                    class: "history-last-point",
                                    cx: "{history_chart.today_x:.2}",
                                    cy: "{history_chart.today_y:.2}",
                                    r: "4.5",
                                }
                                circle {
                                    class: "projection-last-point",
                                    cx: "{history_chart.projection_x:.2}",
                                    cy: "{history_chart.projection_y:.2}",
                                    r: "4",
                                }
                                for label in history_chart.date_labels.iter() {
                                    text {
                                        class: "chart-x-label",
                                        x: "{label.x:.2}",
                                        y: "274",
                                        text_anchor: "{label.anchor}",
                                        "{label.label}"
                                    }
                                }
                            }
                        }
                    }
                    div { class: "history-footnote",
                        span { class: "history-legend-dot" }
                        "Actual"
                        span { class: "history-projection-dot" }
                        "Projected"
                        span { class: "history-range", "{pretty_date(&history_start_date)} – {pretty_date(&history_forecast_end)} · scroll horizontally to explore" }
                    }
                }

                footer { class: "page-footer",
                    span { class: "footer-brand", "hima" }
                    span { "A little more clarity for your time off." }
                    span { class: "footer-hours", "All balances shown in hours" }
                }
            }

            if current_modal == Modal::NewPool || editing_pool_id.is_some() {
                div { class: "modal-backdrop",
                    section { class: "modal-card", role: "dialog", aria_modal: "true", aria_labelledby: "new-pool-title",
                        div { class: "modal-header",
                            div { class: "modal-icon", "◌" }
                            div { class: "modal-heading",
                                h2 { id: "new-pool-title", if editing_pool_id.is_some() { "Edit pool" } else { "Create a pool" } }
                                p {
                                    if editing_pool_id.is_some() {
                                        "Rename this pool. Its balance is calculated from its additions and events."
                                    } else {
                                        "Give a kind of leave its own little home."
                                    }
                                }
                            }
                            button { class: "icon-button modal-close", aria_label: "Close", onclick: move |_| modal.set(Modal::None), "×" }
                        }
                        form {
                            class: "modal-form",
                            onsubmit: move |event| {
                                event.prevent_default();
                                let name = pool_name.read().trim().to_owned();
                                if name.is_empty() {
                                    form_error.set("Add a name for this pool.".to_owned());
                                    return;
                                }
                                let mut data = store.write();
                                if let Some(pool_id) = editing_pool_id {
                                    if let Some(pool) = data.pools.iter_mut().find(|pool| pool.id == pool_id) {
                                        pool.name = name;
                                    } else {
                                        form_error.set("This pool no longer exists.".to_owned());
                                        return;
                                    }
                                } else {
                                    let amount_text = opening_amount.read().trim().to_owned();
                                    let date = opening_date.read().clone();
                                    let initial = if amount_text.is_empty() {
                                        Some(0.0)
                                    } else {
                                        parse_hours(&amount_text, true)
                                    };
                                    if initial.is_none() {
                                        form_error.set("Enter a starting balance with up to two decimal places.".to_owned());
                                        return;
                                    }
                                    if parse_date(&date).is_none() {
                                        form_error.set("Choose a valid starting date.".to_owned());
                                        return;
                                    }
                                    let pool_id = data.allocate_id();
                                    let amount = initial.unwrap_or_default();
                                    let additions = if amount > 0.0 {
                                        vec![OneTimeAddition { id: data.allocate_id(), amount, date }]
                                    } else {
                                        Vec::new()
                                    };
                                    data.pools.push(Pool {
                                        id: pool_id,
                                        name,
                                        additions,
                                        recurring: Vec::new(),
                                    });
                                }
                                drop(data);
                                modal.set(Modal::None);
                                form_error.set(String::new());
                            },
                            label { class: "field-label",
                                "Pool name"
                                input {
                                    r#type: "text",
                                    placeholder: "e.g. Personal leave",
                                    value: "{pool_name}",
                                    maxlength: "48",
                                    autofocus: true,
                                    oninput: move |event| pool_name.set(event.value()),
                                }
                            }
                            if editing_pool_id.is_none() {
                                div { class: "form-two-columns",
                                    label { class: "field-label",
                                        "Starting balance"
                                        div { class: "input-with-suffix",
                                            input {
                                                r#type: "number",
                                                min: "0",
                                                step: "0.01",
                                                placeholder: "0",
                                                value: "{opening_amount}",
                                                oninput: move |event| opening_amount.set(event.value()),
                                            }
                                            span { "hours" }
                                        }
                                    }
                                    label { class: "field-label",
                                        "Balance as of"
                                        input {
                                            r#type: "date",
                                            value: "{opening_date}",
                                            oninput: move |event| opening_date.set(event.value()),
                                        }
                                    }
                                }
                            }
                            if !form_error().is_empty() {
                                p { class: "form-error", "{form_error}" }
                            }
                            div { class: "modal-actions",
                                button { class: "button button-quiet", r#type: "button", onclick: move |_| modal.set(Modal::None), "Cancel" }
                                button {
                                    class: "button button-primary",
                                    r#type: "submit",
                                    if editing_pool_id.is_some() { "Save changes" } else { "Create pool" }
                                }
                            }
                        }
                    }
                }
            }

            if let Some(pool_id) = contribution_pool_id {
                if let Some(pool) = state.pools.iter().find(|pool| pool.id == pool_id) {
                    div { class: "modal-backdrop",
                        section { class: "modal-card", role: "dialog", aria_modal: "true", aria_labelledby: "add-time-title",
                            div { class: "modal-header",
                                div { class: "modal-icon modal-icon-add", "+" }
                                div { class: "modal-heading",
                                    h2 {
                                        id: "add-time-title",
                                        if is_adding_time { "Add time to {pool.name}" } else { "Edit addition in {pool.name}" }
                                    }
                                    p {
                                        if is_adding_time {
                                            "Choose a one-time addition or set a repeating schedule."
                                        } else {
                                            "Update this addition's amount, date, or schedule."
                                        }
                                    }
                                }
                                button { class: "icon-button modal-close", aria_label: "Close", onclick: move |_| modal.set(Modal::None), "×" }
                            }
                            form {
                                class: "modal-form",
                                onsubmit: move |event| {
                                    event.prevent_default();
                                    let amount = parse_hours(&contribution_amount.read(), false);
                                    let date = contribution_date.read().clone();
                                    let recurring = contribution_is_recurring();
                                    let cadence = Cadence::from_form(&contribution_cadence.read());
                                    if amount.is_none() {
                                        form_error.set("Enter an amount greater than zero with up to two decimal places.".to_owned());
                                        return;
                                    }
                                    if parse_date(&date).is_none() {
                                        form_error.set("Choose a valid date.".to_owned());
                                        return;
                                    }
                                    let mut data = store.write();
                                    let mut changed = false;
                                    match current_modal {
                                        Modal::AddTime { pool_id } => {
                                            let id = data.allocate_id();
                                            if let Some(pool) = data.pools.iter_mut().find(|pool| pool.id == pool_id) {
                                                if recurring {
                                                    pool.recurring.push(RecurringAddition {
                                                        id,
                                                        amount: amount.unwrap_or_default(),
                                                        cadence,
                                                        start_date: date,
                                                    });
                                                } else {
                                                    pool.additions.push(OneTimeAddition {
                                                        id,
                                                        amount: amount.unwrap_or_default(),
                                                        date,
                                                    });
                                                }
                                                changed = true;
                                            }
                                        }
                                        Modal::EditAddition { pool_id, addition_id } => {
                                            if let Some(addition) = data.pools.iter_mut()
                                                .find(|pool| pool.id == pool_id)
                                                .and_then(|pool| pool.additions.iter_mut().find(|addition| addition.id == addition_id))
                                            {
                                                addition.amount = amount.unwrap_or_default();
                                                addition.date = date;
                                                changed = true;
                                            }
                                        }
                                        Modal::EditRecurring { pool_id, rule_id } => {
                                            if let Some(rule) = data.pools.iter_mut()
                                                .find(|pool| pool.id == pool_id)
                                                .and_then(|pool| pool.recurring.iter_mut().find(|rule| rule.id == rule_id))
                                            {
                                                rule.amount = amount.unwrap_or_default();
                                                rule.cadence = cadence;
                                                rule.start_date = date;
                                                changed = true;
                                            }
                                        }
                                        _ => {}
                                    }
                                    drop(data);
                                    if !changed {
                                        form_error.set("This addition no longer exists.".to_owned());
                                        return;
                                    }
                                    modal.set(Modal::None);
                                    form_error.set(String::new());
                                },
                                if is_adding_time {
                                    div { class: "segmented-control",
                                        button {
                                            class: if !contribution_is_recurring() { "segment is-active" } else { "segment" },
                                            r#type: "button",
                                            onclick: move |_| contribution_is_recurring.set(false),
                                            "One-time"
                                        }
                                        button {
                                            class: if contribution_is_recurring() { "segment is-active" } else { "segment" },
                                            r#type: "button",
                                            onclick: move |_| contribution_is_recurring.set(true),
                                            "Repeating"
                                        }
                                    }
                                }
                                label { class: "field-label",
                                    "Time to add"
                                    div { class: "input-with-suffix",
                                        input {
                                            r#type: "number",
                                            min: "0.01",
                                            step: "0.01",
                                            placeholder: "e.g. 7.6",
                                            value: "{contribution_amount}",
                                            oninput: move |event| contribution_amount.set(event.value()),
                                        }
                                        span { "hours" }
                                    }
                                }
                                if contribution_is_recurring() {
                                    label { class: "field-label",
                                        "Repeat every"
                                        select {
                                            value: "{contribution_cadence}",
                                            onchange: move |event| contribution_cadence.set(event.value()),
                                            option { value: "weekly", "Week" }
                                            option { value: "fortnightly", "Fortnight" }
                                            option { value: "monthly", "Month" }
                                            option { value: "yearly", "Year" }
                                        }
                                    }
                                }
                                label { class: "field-label",
                                    if contribution_is_recurring() { "First addition on" } else { "Add on" }
                                    input {
                                        r#type: "date",
                                        value: "{contribution_date}",
                                        oninput: move |event| contribution_date.set(event.value()),
                                    }
                                }
                                if !form_error().is_empty() {
                                    p { class: "form-error", "{form_error}" }
                                }
                                div { class: "modal-actions",
                                    button { class: "button button-quiet", r#type: "button", onclick: move |_| modal.set(Modal::None), "Cancel" }
                                    button {
                                        class: "button button-primary",
                                        r#type: "submit",
                                        if is_adding_time { "Save addition" } else { "Save changes" }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if current_modal == Modal::NewEvent || editing_event_id.is_some() {
                div { class: "modal-backdrop",
                    section { class: "modal-card", role: "dialog", aria_modal: "true", aria_labelledby: "new-event-title",
                        div { class: "modal-header",
                            div { class: "modal-icon modal-icon-event", "↘" }
                            div { class: "modal-heading",
                                h2 {
                                    id: "new-event-title",
                                    if editing_event_id.is_some() { "Edit planned leave" } else { "Plan some leave" }
                                }
                                p {
                                    if editing_event_id.is_some() {
                                        "Update dates, hours, or the source pool for any day."
                                    } else {
                                        "Record the hours and source pool for each day."
                                    }
                                }
                            }
                            button { class: "icon-button modal-close", aria_label: "Close", onclick: move |_| modal.set(Modal::None), "×" }
                        }
                        form {
                            class: "modal-form",
                            onsubmit: move |event| {
                                event.prevent_default();
                                let name = event_name.read().trim().to_owned();
                                let day_inputs = event_days.read().clone();
                                if name.is_empty() {
                                    form_error.set("Give this event a name.".to_owned());
                                    return;
                                }
                                if day_inputs.is_empty() {
                                    form_error.set("Add at least one day to this event.".to_owned());
                                    return;
                                }
                                let mut days = Vec::with_capacity(day_inputs.len());
                                let mut unique_dates = HashSet::new();
                                for input in day_inputs {
                                    if parse_date(&input.date).is_none() {
                                        form_error.set("Choose a valid date for each event day.".to_owned());
                                        return;
                                    }
                                    if !unique_dates.insert(input.date.clone()) {
                                        form_error.set("Each event day must have a different date.".to_owned());
                                        return;
                                    }
                                    if input.allocations.is_empty() {
                                        form_error.set("Choose at least one pool for each event day.".to_owned());
                                        return;
                                    }
                                    let mut allocations = Vec::with_capacity(input.allocations.len());
                                    let mut unique_pools = HashSet::new();
                                    for allocation in input.allocations {
                                        if !unique_pools.insert(allocation.pool_id) {
                                            form_error.set("Choose each pool only once per day.".to_owned());
                                            return;
                                        }
                                        if !store.read().pools.iter().any(|pool| pool.id == allocation.pool_id) {
                                            form_error.set("Choose an existing pool for each event day.".to_owned());
                                            return;
                                        }
                                        let Some(hours) = parse_hours(&allocation.hours, false) else {
                                            form_error.set("Enter positive hours with up to two decimal places for each pool allocation.".to_owned());
                                            return;
                                        };
                                        allocations.push(PoolAllocation {
                                            pool_id: allocation.pool_id,
                                            hours,
                                        });
                                    }
                                    days.push(LeaveDay {
                                        date: input.date,
                                        allocations,
                                    });
                                }
                                days.sort_by(|left, right| left.date.cmp(&right.date));
                                let mut data = store.write();
                                let changed = if let Some(event_id) = editing_event_id {
                                    if let Some(event) = data.events.iter_mut().find(|event| event.id == event_id) {
                                        event.name = name;
                                        event.days = days;
                                        true
                                    } else {
                                        false
                                    }
                                } else {
                                    let id = data.allocate_id();
                                    data.events.push(LeaveEvent {
                                        id,
                                        name,
                                        days,
                                    });
                                    true
                                };
                                drop(data);
                                if !changed {
                                    form_error.set("This event no longer exists.".to_owned());
                                    return;
                                }
                                modal.set(Modal::None);
                                form_error.set(String::new());
                            },
                            label { class: "field-label",
                                "Event name"
                                input {
                                    r#type: "text",
                                    placeholder: "e.g. A long weekend",
                                    value: "{event_name}",
                                    maxlength: "64",
                                    autofocus: true,
                                    oninput: move |event| event_name.set(event.value()),
                                }
                            }
                            div { class: "event-days-editor",
                                div { class: "event-days-heading",
                                    span { "Days covered" }
                                    span { "Hours are recorded per day" }
                                }
                                for (day_index, day) in event_days.read().iter().enumerate() {
                                    {
                                        let available_pool_id = state.pools.iter()
                                            .find(|pool| !day.allocations.iter().any(|allocation| allocation.pool_id == pool.id))
                                            .map(|pool| pool.id);
                                        let can_add_pool = day.allocations.len() < state.pools.len();
                                        rsx! {
                                            div { class: "event-day-card", key: "event-day-{day_index}",
                                                div { class: "event-day-header",
                                                    label { class: "field-label",
                                                        "Date"
                                                        input {
                                                            r#type: "date",
                                                            value: "{day.date}",
                                                            oninput: move |event| {
                                                                if let Some(day) = event_days.write().get_mut(day_index) {
                                                                    day.date = event.value();
                                                                }
                                                            },
                                                        }
                                                    }
                                                    if event_days.read().len() > 1 {
                                                        button {
                                                            class: "icon-button event-day-remove",
                                                            r#type: "button",
                                                            title: "Remove day",
                                                            aria_label: "Remove event day",
                                                            onclick: move |_| {
                                                                if day_index < event_days.read().len() {
                                                                    event_days.write().remove(day_index);
                                                                }
                                                            },
                                                            "×"
                                                        }
                                                    }
                                                }
                                                div { class: "event-allocations",
                                                    for (allocation_index, allocation) in day.allocations.iter().enumerate() {
                                                        div { class: "event-allocation-row", key: "event-day-{day_index}-allocation-{allocation_index}",
                                                            label { class: "field-label",
                                                                "Pool"
                                                                select {
                                                                    value: "{allocation.pool_id}",
                                                                    onchange: move |event| {
                                                                        if let Ok(pool_id) = event.value().parse::<u64>() {
                                                                            if let Some(allocation) = event_days.write()
                                                                                .get_mut(day_index)
                                                                                .and_then(|day| day.allocations.get_mut(allocation_index))
                                                                            {
                                                                                allocation.pool_id = pool_id;
                                                                            }
                                                                        }
                                                                    },
                                                                    for pool in state.pools.iter() {
                                                                        option { value: "{pool.id}", "{pool.name}" }
                                                                    }
                                                                }
                                                            }
                                                            label { class: "field-label",
                                                                "Hours"
                                                                input {
                                                                    r#type: "number",
                                                                    min: "0.01",
                                                                    step: "0.01",
                                                                    placeholder: "e.g. 3.5",
                                                                    value: "{allocation.hours}",
                                                                    oninput: move |event| {
                                                                        if let Some(allocation) = event_days.write()
                                                                            .get_mut(day_index)
                                                                            .and_then(|day| day.allocations.get_mut(allocation_index))
                                                                        {
                                                                            allocation.hours = event.value();
                                                                        }
                                                                    },
                                                                }
                                                            }
                                                            if day.allocations.len() > 1 {
                                                                button {
                                                                    class: "icon-button allocation-remove",
                                                                    r#type: "button",
                                                                    title: "Remove pool allocation",
                                                                    aria_label: "Remove pool allocation",
                                                                    onclick: move |_| {
                                                                        if let Some(day) = event_days.write().get_mut(day_index) {
                                                                            if day.allocations.len() > 1 && allocation_index < day.allocations.len() {
                                                                                day.allocations.remove(allocation_index);
                                                                            }
                                                                        }
                                                                    },
                                                                    "×"
                                                                }
                                                            }
                                                        }
                                                    }
                                                    if can_add_pool {
                                                        button {
                                                            class: "button button-soft button-small add-day-button",
                                                            r#type: "button",
                                                            onclick: move |_| {
                                                                if let Some(pool_id) = available_pool_id {
                                                                    if let Some(day) = event_days.write().get_mut(day_index) {
                                                                        day.allocations.push(PoolAllocationInput {
                                                                            pool_id,
                                                                            hours: String::new(),
                                                                        });
                                                                    }
                                                                }
                                                            },
                                                            span { class: "button-plus", "+" }
                                                            "Split this day across another pool"
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                button {
                                    class: "button button-soft button-small add-day-button",
                                    r#type: "button",
                                    onclick: move |_| {
                                        let default_pool_id = first_pool_id.unwrap_or_default();
                                        let (date, pool_id) = event_days.read().last()
                                            .map(|day| (
                                                next_date_after(&day.date),
                                                day.allocations.first().map(|allocation| allocation.pool_id).unwrap_or(default_pool_id),
                                            ))
                                            .unwrap_or_else(|| (today_date(), first_pool_id.unwrap_or_default()));
                                        event_days.write().push(EventDayInput::new(date, pool_id));
                                    },
                                    span { class: "button-plus", "+" }
                                    "Add another day"
                                }
                            }
                            if !form_error().is_empty() {
                                p { class: "form-error", "{form_error}" }
                            }
                            div { class: "modal-actions",
                                button { class: "button button-quiet", r#type: "button", onclick: move |_| modal.set(Modal::None), "Cancel" }
                                button {
                                    class: "button button-primary",
                                    r#type: "submit",
                                    if editing_event_id.is_some() { "Save changes" } else { "Add to plan" }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

fn format_hours(value: f64) -> String {
    let rounded = (value * 100.0).round() / 100.0;
    if rounded.abs() < 0.005 {
        "0".to_owned()
    } else if (rounded.fract()).abs() < 0.005 {
        format!("{rounded:.0}")
    } else {
        format!("{rounded:.2}")
            .trim_end_matches('0')
            .trim_end_matches('.')
            .to_owned()
    }
}

fn fresh_event_days(pool_id: u64) -> Vec<EventDayInput> {
    vec![EventDayInput::new(today_date(), pool_id)]
}

fn parse_hours(value: &str, allow_zero: bool) -> Option<f64> {
    let amount = value.trim().parse::<f64>().ok()?;
    let cents = amount * 100.0;
    if !amount.is_finite()
        || !cents.is_finite()
        || (cents - cents.round()).abs() > 1e-7
        || amount < 0.0
        || (!allow_zero && amount == 0.0)
    {
        return None;
    }

    Some(cents.round() / 100.0)
}

fn pretty_date(value: &str) -> String {
    parse_date(value)
        .map(|date| date.format("%b %d, %Y").to_string())
        .unwrap_or_else(|| value.to_owned())
}

fn next_date_after(value: &str) -> String {
    parse_date(value)
        .and_then(|date| date.succ_opt())
        .map(|date| date.format("%Y-%m-%d").to_string())
        .unwrap_or_else(today_date)
}

fn balance_history(store: &Store, today_date: &str) -> Vec<BalancePoint> {
    let Some(today) = parse_date(today_date) else {
        return Vec::new();
    };
    let start = today.checked_sub_months(Months::new(12)).unwrap_or(today);
    let end = today.checked_add_months(Months::new(12)).unwrap_or(today);
    let mut points = Vec::new();
    let mut date = start;

    loop {
        let date_string = date.format("%Y-%m-%d").to_string();
        points.push(BalancePoint {
            date,
            balance: store.totals_on(&date_string).2,
            projected: date > today,
        });
        if date >= end {
            break;
        }
        date = date.succ_opt().unwrap_or(end);
    }

    points
}

fn chart_layout(points: &[BalancePoint]) -> BalanceChart {
    const WIDTH: f64 = 1_600.0;
    const LEFT: f64 = 68.0;
    const RIGHT: f64 = WIDTH - 18.0;
    const TOP: f64 = 18.0;
    const BOTTOM: f64 = 232.0;

    let first = points
        .first()
        .expect("balance history includes its start date");
    let last = points
        .last()
        .expect("balance history includes its end date");
    let min_balance = points
        .iter()
        .map(|point| point.balance)
        .fold(f64::INFINITY, f64::min);
    let max_balance = points
        .iter()
        .map(|point| point.balance)
        .fold(f64::NEG_INFINITY, f64::max);
    let spread = max_balance - min_balance;
    let padding = if spread < 0.01 { 1.0 } else { spread * 0.12 };
    let lower = min_balance - padding;
    let upper = max_balance + padding;
    let range = upper - lower;
    let zero_y = (lower <= 0.0 && upper >= 0.0).then(|| TOP + upper / range * (BOTTOM - TOP));
    let total_days = last
        .date
        .signed_duration_since(first.date)
        .num_days()
        .max(1) as f64;

    let coordinates = points
        .iter()
        .map(|point| {
            let elapsed = point.date.signed_duration_since(first.date).num_days() as f64;
            let x = LEFT + elapsed / total_days * (RIGHT - LEFT);
            let y = TOP + (upper - point.balance) / range * (BOTTOM - TOP);
            (x, y)
        })
        .collect::<Vec<_>>();

    let today_index = points
        .iter()
        .rposition(|point| !point.projected)
        .unwrap_or_default();
    let today_x = coordinates[today_index].0;
    let today_y = coordinates[today_index].1;
    let (projection_x, projection_y) = *coordinates.last().expect("chart has at least one point");
    let history_coordinates = &coordinates[..=today_index];
    let projection_coordinates = &coordinates[today_index..];
    let history_line_path = step_path(history_coordinates);
    let history_area_path = area_path(history_coordinates, BOTTOM);
    let projection_line_path = step_path(projection_coordinates);
    let projection_area_path = area_path(projection_coordinates, BOTTOM);

    let ticks = (0..=4)
        .map(|index| {
            let value = lower + range * index as f64 / 4.0;
            let y = TOP + (upper - value) / range * (BOTTOM - TOP);
            ChartTick {
                y,
                label: format!("{} h", format_hours(value)),
                is_zero: value.abs() < 1e-7,
            }
        })
        .collect();

    let last_index = points.len() - 1;
    let date_labels = [(0, "start"), (today_index, "middle"), (last_index, "end")]
        .into_iter()
        .fold(Vec::new(), |mut labels, (index, anchor)| {
            if labels
                .last()
                .is_none_or(|label: &ChartDateLabel| label.x != coordinates[index].0)
            {
                labels.push(ChartDateLabel {
                    x: coordinates[index].0,
                    label: if index == today_index {
                        "Today".to_owned()
                    } else {
                        points[index].date.format("%b %Y").to_string()
                    },
                    anchor,
                });
            }
            labels
        });

    BalanceChart {
        history_line_path,
        history_area_path,
        projection_line_path,
        projection_area_path,
        ticks,
        date_labels,
        zero_y,
        today_x,
        width: WIDTH,
        today_y,
        projection_x,
        projection_y,
    }
}

fn step_path(points: &[(f64, f64)]) -> String {
    let (first_x, first_y) = points.first().expect("chart segment includes a point");
    let steps = points
        .iter()
        .skip(1)
        .map(|(x, y)| format!("H{x:.2} V{y:.2}"))
        .collect::<Vec<_>>()
        .join(" ");
    format!("M{first_x:.2},{first_y:.2} {steps}")
}

fn area_path(points: &[(f64, f64)], baseline: f64) -> String {
    let line = step_path(points);
    let (first_x, _) = points.first().expect("chart segment includes a point");
    let (last_x, _) = points.last().expect("chart segment includes a point");
    format!("{line} L{last_x:.2},{baseline:.2} L{first_x:.2},{baseline:.2} Z")
}

fn format_signed_hours(value: f64) -> String {
    if value > 0.0 {
        format!("+{}", format_hours(value))
    } else if value < 0.0 {
        format!("−{}", format_hours(-value))
    } else {
        "0".to_owned()
    }
}

fn event_date_range_label(event: &LeaveEvent) -> String {
    let first = pretty_date(event.first_date());
    let last = pretty_date(event.last_date());
    if first == last {
        first
    } else {
        format!("{first} – {last}")
    }
}

fn event_day_summary(event: &LeaveEvent, pools: &[Pool]) -> String {
    event
        .days
        .iter()
        .map(|day| {
            let allocations = day
                .allocations
                .iter()
                .map(|allocation| {
                    let pool_name = pools
                        .iter()
                        .find(|pool| pool.id == allocation.pool_id)
                        .map(|pool| pool.name.as_str())
                        .unwrap_or("Removed pool");
                    format!("{} h from {}", format_hours(allocation.hours), pool_name)
                })
                .collect::<Vec<_>>()
                .join(" + ");
            format!("{}: {allocations}", pretty_date(&day.date))
        })
        .collect::<Vec<_>>()
        .join(" · ")
}

fn event_pool_summary(event: &LeaveEvent, pools: &[Pool]) -> String {
    let mut pool_names = Vec::new();
    for day in &event.days {
        for allocation in &day.allocations {
            let name = pools
                .iter()
                .find(|pool| pool.id == allocation.pool_id)
                .map(|pool| pool.name.clone())
                .unwrap_or_else(|| "Removed pool".to_owned());
            if !pool_names.contains(&name) {
                pool_names.push(name);
            }
        }
    }

    match pool_names.len() {
        0 => "No pool".to_owned(),
        1 => pool_names.pop().unwrap_or_default(),
        _ => format!("Pools: {}", pool_names.join(", ")),
    }
}

fn month_label(value: &str) -> String {
    parse_date(value)
        .map(|date| date.format("%b").to_string().to_uppercase())
        .unwrap_or_default()
}

fn day_label(value: &str) -> String {
    parse_date(value)
        .map(|date| date.format("%d").to_string())
        .unwrap_or_default()
}

fn plural<'a>(count: usize, singular: &'a str, plural: &'a str) -> &'a str {
    if count == 1 {
        singular
    } else {
        plural
    }
}

fn today_date() -> String {
    #[cfg(target_arch = "wasm32")]
    {
        let now = js_sys::Date::new_0();
        return format!(
            "{:04}-{:02}-{:02}",
            now.get_full_year(),
            now.get_month() + 1,
            now.get_date()
        );
    }

    #[cfg(not(target_arch = "wasm32"))]
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

#[cfg(target_arch = "wasm32")]
fn load_store() -> Store {
    web_sys::window()
        .and_then(|window| window.local_storage().ok().flatten())
        .and_then(|storage| storage.get_item(STORAGE_KEY).ok().flatten())
        .and_then(|saved| serde_json::from_str(&saved).ok())
        .unwrap_or_default()
}

#[cfg(not(target_arch = "wasm32"))]
fn load_store() -> Store {
    Store::default()
}

#[cfg(target_arch = "wasm32")]
fn save_store(store: &Store) {
    if let (Some(window), Ok(serialized)) = (web_sys::window(), serde_json::to_string(store)) {
        if let Ok(Some(storage)) = window.local_storage() {
            let _ = storage.set_item(STORAGE_KEY, &serialized);
        }
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn save_store(_: &Store) {}

#[cfg(target_arch = "wasm32")]
fn confirm_delete(message: &str) -> bool {
    web_sys::window()
        .and_then(|window| window.confirm_with_message(message).ok())
        .unwrap_or(false)
}

#[cfg(not(target_arch = "wasm32"))]
fn confirm_delete(_: &str) -> bool {
    true
}

#[cfg(test)]
mod tests {
    use super::{balance_history, chart_layout, parse_hours, Store};

    #[test]
    fn hour_amounts_allow_up_to_two_decimal_places() {
        assert_eq!(parse_hours("7.65", false), Some(7.65));
        assert_eq!(parse_hours("0.00", true), Some(0.0));
        assert_eq!(parse_hours("7.654", false), None);
        assert_eq!(parse_hours("0", false), None);
        assert_eq!(parse_hours("-1.25", true), None);
    }

    #[test]
    fn balance_history_contains_a_year_of_actuals_and_projections() {
        let history = balance_history(&Store::default(), "2026-10-06");
        let chart = chart_layout(&history);

        assert_eq!(history.len(), 731);
        assert_eq!(
            history.first().unwrap().date.format("%Y-%m-%d").to_string(),
            "2025-10-06"
        );
        assert_eq!(
            history
                .iter()
                .rev()
                .find(|point| !point.projected)
                .unwrap()
                .date
                .format("%Y-%m-%d")
                .to_string(),
            "2026-10-06"
        );
        assert_eq!(
            history.last().unwrap().date.format("%Y-%m-%d").to_string(),
            "2027-10-06"
        );
        assert_eq!(chart.date_labels.len(), 3);
        assert_eq!(chart.date_labels[1].label, "Today");
        assert!(chart.history_line_path.starts_with('M'));
        assert!(chart.projection_line_path.starts_with('M'));
        assert_eq!(chart.width, 1600.0);
    }
}
