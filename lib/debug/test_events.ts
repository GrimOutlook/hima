import { LeaveEventDto } from "../models/LeaveEvent"
import dayjs from "dayjs"

const test_events: LeaveEventDto[] = [
    {
        id: 1,
        title: "Birthday Party",
        description: "Mom's birthday party",
        dates: [dayjs("2025-01-01").toJSON()],
        poolTransactions: [
            {
                date: dayjs("2025-01-01").toJSON(),
                hours: 8,
                poolId: 0
            }
        ]
    },
    {
        id: 2,
        title: "Doctors Appointment",
        description: "Appointment @ 2pm",
        dates: [dayjs("2025-01-14").toJSON()],
        poolTransactions: [
            {
                date: dayjs("2025-01-01").toJSON(),
                hours: 2,
                poolId: 1
            }
        ]
    },
    {
        id: 3,
        title: "Honeymoon",
        description: "Trip from Seoul to Tokyo",
        dates:
            [...Array(14).keys()].map((day_offset) => dayjs("2025-02-01").add(day_offset, 'day').toJSON())
        ,
        poolTransactions: [
            {
                date: dayjs("2025-01-01").toJSON(),
                hours: 8,
                poolId: 0,
            }
        ]
    },
]

export default test_events;
