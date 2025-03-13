"use client";
import { PPLEventDto } from "../models/PPLEventDto";
import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit/react";
import { getNextId } from "@/lib/helpers";

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
    selectNextEventID: (state) => {
      getNextId(state.events.map((event) => event.id));
    },
  },
});

export const { addEvent, removeEvent } = eventListSlice.actions;

export const { selectEvents, selectNextEventID } = eventListSlice.selectors;
