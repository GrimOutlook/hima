"use client";
import { LeaveEventDto } from "../models/LeaveEvent";
import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit/react";
import { getNextId } from "@/lib/helpers";
import test_events from "../debug/test_events"
import { debug_lists } from "../debug/debug";

const events = debug_lists == true ? test_events : []


export interface LeaveEventListState {
  events: LeaveEventDto[];
}

const initialState: LeaveEventListState = {
  events: events,
};

export const eventListSlice = createSlice({
  initialState,
  name: "eventList",
  reducers: (create) => ({
    addEvent: create.reducer((state, action: PayloadAction<LeaveEventDto>) => {
      state.events.push(action.payload);
    }),
    removeEvent: create.reducer((state, action: PayloadAction<number>) => {
      state.events = state.events.filter(
        (event: LeaveEventDto) => action.payload !== event.id
      );
    }),
  }),
  selectors: {
    selectEvents: (state) => state.events,
    selectNextEventID: (state) =>
      getNextId(state.events.map((event) => event.id!)),
  },
});

export const { addEvent, removeEvent } = eventListSlice.actions;

export const { selectEvents, selectNextEventID } = eventListSlice.selectors;
