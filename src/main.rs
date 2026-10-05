mod model;

use dioxus::prelude::*;
use model::{parse_date, Cadence, LeaveEvent, OneTimeAddition, Pool, RecurringAddition, Store};

#[cfg(target_arch = "wasm32")]
const STORAGE_KEY: &str = "hima.store.v1";

#[derive(Clone, Copy, PartialEq)]
enum Modal {
    None,
    NewPool,
    AddTime { pool_id: u64 },
    NewEvent,
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
    let mut event_amount = use_signal(String::new);
    let mut event_date = use_signal(today_date);
    let mut event_pool_id = use_signal(|| 0_u64);

    use_effect(move || {
        let snapshot = store.read().clone();
        save_store(&snapshot);
    });

    let selected_date = balance_date();
    let (accrued, used, balance) = state.totals_on(&selected_date);
    let first_pool_id = state.pools.first().map(|pool| pool.id);
    let mut timeline = state.events.clone();
    timeline.sort_by(|left, right| left.date.cmp(&right.date));
    let event_word = plural(timeline.len(), "event", "events");
    let current_modal = modal();

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
                                                button {
                                                    class: "icon-button delete-button",
                                                    title: "Delete pool and its events",
                                                    aria_label: "Delete {pool.name}",
                                                    onclick: move |_| {
                                                        if confirm_delete(&format!("Remove ‘{pool_name_for_delete}’ and all events assigned to it?")) {
                                                            let mut data = store.write();
                                                            data.pools.retain(|candidate| candidate.id != pool_id);
                                                            data.events.retain(|event| event.pool_id != pool_id);
                                                        }
                                                    },
                                                    "×"
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
                                                        div { class: "rule-row", key: "recurring-{rule.id}",
                                                            span { class: "rule-symbol recurring-symbol", "↻" }
                                                            span { class: "rule-copy", "+{format_hours(rule.amount)} h every {rule.cadence.label()}" }
                                                            span { class: "rule-date", "from {pretty_date(&rule.start_date)}" }
                                                        }
                                                    }
                                                    for addition in pool.additions.iter().rev().take(3) {
                                                        div { class: "rule-row", key: "addition-{addition.id}",
                                                            span { class: "rule-symbol one-time-symbol", "+" }
                                                            span { class: "rule-copy", "+{format_hours(addition.amount)} h one-time" }
                                                            span { class: "rule-date", "on {pretty_date(&addition.date)}" }
                                                        }
                                                    }
                                                    if pool.additions.len() > 3 {
                                                        p { class: "more-additions", "+{pool.additions.len() - 3} earlier additions" }
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
                                        event_amount.set(String::new());
                                        event_date.set(today_date());
                                        if let Some(first_pool_id) = first_pool_id {
                                            event_pool_id.set(first_pool_id);
                                        }
                                        modal.set(Modal::NewEvent);
                                    },
                                    span { class: "button-plus", "+" }
                                    "Add event"
                                }
                            }
                            p { class: "events-caption", "Leave is deducted from the pool you choose." }

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
                                                event_amount.set(String::new());
                                                event_date.set(today_date());
                                                if let Some(first_pool_id) = first_pool_id {
                                                    event_pool_id.set(first_pool_id);
                                                }
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
                                            let event_is_counted = event.date.as_str() <= selected_date.as_str();
                                            let pool_name = state.pools.iter()
                                                .find(|pool| pool.id == event.pool_id)
                                                .map(|pool| pool.name.clone())
                                                .unwrap_or_else(|| "Removed pool".to_owned());
                                            rsx! {
                                                article { class: "event-row", key: "event-{event_id}",
                                                    div { class: "event-date-block",
                                                        span { class: "event-month", "{month_label(&event.date)}" }
                                                        strong { "{day_label(&event.date)}" }
                                                    }
                                                    div { class: "event-info",
                                                        strong { "{event.name}" }
                                                        span { "{pool_name} · {pretty_date(&event.date)}" }
                                                        span {
                                                            class: if event_is_counted { "event-status event-status-counted" } else { "event-status" },
                                                            if event_is_counted { "Included in balance" } else { "After selected date" }
                                                        }
                                                    }
                                                    div { class: "event-amount", "−{format_hours(event.amount)} h" }
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

                            div { class: "events-panel-footer",
                                span { "{timeline.len()} {event_word}" }
                                span { "{format_hours(used)} h used by selected date" }
                            }
                        }
                    }
                }

                footer { class: "page-footer",
                    span { class: "footer-brand", "hima" }
                    span { "A little more clarity for your time off." }
                    span { class: "footer-hours", "All balances shown in hours" }
                }
            }

            if current_modal == Modal::NewPool {
                div { class: "modal-backdrop",
                    section { class: "modal-card", role: "dialog", aria_modal: "true", aria_labelledby: "new-pool-title",
                        div { class: "modal-header",
                            div { class: "modal-icon", "◌" }
                            div { class: "modal-heading",
                                h2 { id: "new-pool-title", "Create a pool" }
                                p { "Give a kind of leave its own little home." }
                            }
                            button { class: "icon-button modal-close", aria_label: "Close", onclick: move |_| modal.set(Modal::None), "×" }
                        }
                        form {
                            class: "modal-form",
                            onsubmit: move |event| {
                                event.prevent_default();
                                let name = pool_name.read().trim().to_owned();
                                let amount_text = opening_amount.read().trim().to_owned();
                                let date = opening_date.read().clone();
                                if name.is_empty() {
                                    form_error.set("Add a name for this pool.".to_owned());
                                    return;
                                }
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
                                let mut data = store.write();
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
                            if !form_error().is_empty() {
                                p { class: "form-error", "{form_error}" }
                            }
                            div { class: "modal-actions",
                                button { class: "button button-quiet", r#type: "button", onclick: move |_| modal.set(Modal::None), "Cancel" }
                                button { class: "button button-primary", r#type: "submit", "Create pool" }
                            }
                        }
                    }
                }
            }

            if let Modal::AddTime { pool_id } = current_modal {
                if let Some(pool) = state.pools.iter().find(|pool| pool.id == pool_id) {
                    div { class: "modal-backdrop",
                        section { class: "modal-card", role: "dialog", aria_modal: "true", aria_labelledby: "add-time-title",
                            div { class: "modal-header",
                                div { class: "modal-icon modal-icon-add", "+" }
                                div { class: "modal-heading",
                                    h2 { id: "add-time-title", "Add time to {pool.name}" }
                                    p { "Choose a one-time addition or set a repeating schedule." }
                                }
                                button { class: "icon-button modal-close", aria_label: "Close", onclick: move |_| modal.set(Modal::None), "×" }
                            }
                            form {
                                class: "modal-form",
                                onsubmit: move |event| {
                                    event.prevent_default();
                                    let amount = parse_hours(&contribution_amount.read(), false);
                                    let date = contribution_date.read().clone();
                                    if amount.is_none() {
                                        form_error.set("Enter an amount greater than zero with up to two decimal places.".to_owned());
                                        return;
                                    }
                                    if parse_date(&date).is_none() {
                                        form_error.set("Choose a valid date.".to_owned());
                                        return;
                                    }
                                    let mut data = store.write();
                                    let id = data.allocate_id();
                                    if let Some(pool) = data.pools.iter_mut().find(|pool| pool.id == pool_id) {
                                        if contribution_is_recurring() {
                                            pool.recurring.push(RecurringAddition {
                                                id,
                                                amount: amount.unwrap_or_default(),
                                                cadence: Cadence::from_form(&contribution_cadence.read()),
                                                start_date: date,
                                            });
                                        } else {
                                            pool.additions.push(OneTimeAddition {
                                                id,
                                                amount: amount.unwrap_or_default(),
                                                date,
                                            });
                                        }
                                    }
                                    drop(data);
                                    modal.set(Modal::None);
                                    form_error.set(String::new());
                                },
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
                                    button { class: "button button-primary", r#type: "submit", "Save addition" }
                                }
                            }
                        }
                    }
                }
            }

            if current_modal == Modal::NewEvent {
                div { class: "modal-backdrop",
                    section { class: "modal-card", role: "dialog", aria_modal: "true", aria_labelledby: "new-event-title",
                        div { class: "modal-header",
                            div { class: "modal-icon modal-icon-event", "↘" }
                            div { class: "modal-heading",
                                h2 { id: "new-event-title", "Plan some leave" }
                                p { "We'll take these hours from the pool you select." }
                            }
                            button { class: "icon-button modal-close", aria_label: "Close", onclick: move |_| modal.set(Modal::None), "×" }
                        }
                        form {
                            class: "modal-form",
                            onsubmit: move |event| {
                                event.prevent_default();
                                let name = event_name.read().trim().to_owned();
                                let amount = parse_hours(&event_amount.read(), false);
                                let date = event_date.read().clone();
                                let pool_id = event_pool_id();
                                if name.is_empty() {
                                    form_error.set("Give this event a name.".to_owned());
                                    return;
                                }
                                if amount.is_none() {
                                    form_error.set("Enter an amount greater than zero with up to two decimal places.".to_owned());
                                    return;
                                }
                                if parse_date(&date).is_none() {
                                    form_error.set("Choose a valid date.".to_owned());
                                    return;
                                }
                                if !store.read().pools.iter().any(|pool| pool.id == pool_id) {
                                    form_error.set("Choose a pool for this event.".to_owned());
                                    return;
                                }
                                let mut data = store.write();
                                let id = data.allocate_id();
                                data.events.push(LeaveEvent {
                                    id,
                                    name,
                                    pool_id,
                                    amount: amount.unwrap_or_default(),
                                    date,
                                });
                                drop(data);
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
                            div { class: "form-two-columns",
                                label { class: "field-label",
                                    "Time used"
                                    div { class: "input-with-suffix",
                                        input {
                                            r#type: "number",
                                            min: "0.01",
                                            step: "0.01",
                                            placeholder: "e.g. 7.6",
                                            value: "{event_amount}",
                                            oninput: move |event| event_amount.set(event.value()),
                                        }
                                        span { "hours" }
                                    }
                                }
                                label { class: "field-label",
                                    "Leave date"
                                    input {
                                        r#type: "date",
                                        value: "{event_date}",
                                        oninput: move |event| event_date.set(event.value()),
                                    }
                                }
                            }
                            label { class: "field-label",
                                "Take time from"
                                select {
                                    value: "{event_pool_id}",
                                    onchange: move |event| {
                                        if let Ok(pool_id) = event.value().parse::<u64>() {
                                            event_pool_id.set(pool_id);
                                        }
                                    },
                                    for pool in state.pools.iter() {
                                        option { value: "{pool.id}", "{pool.name}" }
                                    }
                                }
                            }
                            if !form_error().is_empty() {
                                p { class: "form-error", "{form_error}" }
                            }
                            div { class: "modal-actions",
                                button { class: "button button-quiet", r#type: "button", onclick: move |_| modal.set(Modal::None), "Cancel" }
                                button { class: "button button-primary", r#type: "submit", "Add to plan" }
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
    use super::parse_hours;

    #[test]
    fn hour_amounts_allow_up_to_two_decimal_places() {
        assert_eq!(parse_hours("7.65", false), Some(7.65));
        assert_eq!(parse_hours("0.00", true), Some(0.0));
        assert_eq!(parse_hours("7.654", false), None);
        assert_eq!(parse_hours("0", false), None);
        assert_eq!(parse_hours("-1.25", true), None);
    }
}
