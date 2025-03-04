export enum Period {
    Daily = "DAILY",
    Weekly = "WEEKLY",
    BiWeekly = "BIWEEKLY",
    Monthly = "MONTHLY",
    Yearly = "YEARLY"
}

export function DeserializeToPeriod(period: string) {
    
    switch(period.toUpperCase()) {
        case "DAILY":
            return Period.Daily
        case "WEEKLY":
            return Period.Weekly
        case "BIWEEKLY":
            return Period.BiWeekly
        case "MONTHLY":
            return Period.Monthly
        case "YEARLY":
            return Period.Yearly
        default:
            console.error(`Error deserializing period ${period}. Defaulting to daily.`)
            return Period.Daily
    }
}