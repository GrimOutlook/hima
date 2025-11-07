import { LeavePoolDto } from "@/lib/models/LeavePool";
import { Period } from "../models/Period";
import dayjs from "dayjs";

const test_pools: LeavePoolDto[] = [
    {
        id: 0,
        name: "PPL",
        description: "Standard PPL",
        amount: 8,
        period: Period.BiWeekly,
        startAmount: 0,
        startDate: dayjs("2024-01-01").toJSON(),
    },
    {
        id: 1,
        name: "Sick Leave",
        description: "Leave for sickness",
        amount: 40,
        period: Period.Yearly,
        startAmount: 40,
        startDate: dayjs("2024-01-01").toJSON(),
    },
]

export default test_pools;
