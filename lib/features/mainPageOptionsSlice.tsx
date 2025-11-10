"use client";
import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit/react";
import dayjs from "dayjs";

export interface MainPageState {
  projectionDate: number;
  showAllEvents: boolean;
}

const initialState: MainPageState = {
  projectionDate: dayjs().toDate().getTime(),
  showAllEvents: false,
};

export const mainPageOptionsSlice = createSlice({
  initialState,
  name: "mainPageOptions",
  reducers: (create) => ({
    setProjectionDate: create.reducer((state, action: PayloadAction<number>) => {
      state.projectionDate = action.payload;
    }),
    setShowAllEvents: create.reducer((state, action: PayloadAction<boolean>) => {
      console.log("Setting showAllEvents to " + action.payload)
      state.showAllEvents = action.payload;
    }),
  }),
  selectors: {
    selectProjectionDate: (state) => state.projectionDate,
    selectShowAllEvents: (state) => state.showAllEvents,
  },
});

export const { setProjectionDate, setShowAllEvents } =
  mainPageOptionsSlice.actions;

export const { selectProjectionDate, selectShowAllEvents } = mainPageOptionsSlice.selectors;
