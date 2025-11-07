"use client";
import { LeaveEventDto } from "../models/LeaveEvent";
import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit/react";
import { getNextId } from "@/lib/helpers";
import dayjs from "dayjs";

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
        dates: [dayjs("2025-01-14")],
        poolTransactions: [
            {
                date: dayjs("2025-01-01"),
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
                date: dayjs("2025-01-01"),
                hours: 8,
                poolId: 0,
            }
        ]
    },
]
const events = test_events

export interface PPLEventListState {
    events: PPLEventDto[];
}

const initialState: PPLEventListState = {
    events: [],
};

export const eventListSlice = createSlice({
    initialState,
    name: "eventList",
    reducers: (create) => ({
        addEvent: create.reducer((state, action: PayloadAction<PPLEventDto>) => {
            state.events.push(action.payload);
        }),
        removeEvent: create.reducer((state, action: PayloadAction<number>) => {
            state.events = state.events.filter(
                (event: PPLEventDto) => action.payload !== event.id
            );
        }),
    }),
    selectors: {
        selectEvents: (state) => state.events,
        selectNextEventID: (state) =>
            getNextId(state.events.map((event) => event.id)),
    },
});

export const { addEvent, removeEvent } = eventListSlice.actions;

export const { selectEvents, selectNextEventID } = eventListSlice.selectors;
