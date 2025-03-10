"use client";
import { createSlice } from "@reduxjs/toolkit/react";
import type { PayloadAction } from "@reduxjs/toolkit";
import { randomInt } from "../helpers";
import { PPLEventDto } from "../models/PPLEventDto";

export interface PPLEventListState {
  events: PPLEventDto[];
}

const initialState: PPLEventListState = {
  events: [],
};

export const eventListSlice = createSlice({
  name: "eventList",
  initialState,
  reducers: (create) => ({
    addEvent: create.reducer((state, action: PayloadAction<PPLEventDto>) => {
      console.log(`Adding event with ID ${action.payload.id}`);
      state.events.push(action.payload);
    }),
    removeEvent: create.reducer((state, action: PayloadAction<number>) => {
      state.events = state.events.filter(
        (event: PPLEventDto) => action.payload != event.id,
      );
    }),
  }),
  selectors: {
    selectEvents: (state) => state.events,
    selectNextEventID: (state) => {
      let next_id = 0;
      do {
        next_id = randomInt(0, 2 ** 48 - 1);
      } while (state.events.some((event) => event.id == next_id));
      return next_id;
    },
  },
});

export const { addEvent, removeEvent } = eventListSlice.actions;

export const { selectEvents, selectNextEventID } = eventListSlice.selectors;
