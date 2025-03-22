"use client";
import { createSlice } from "@reduxjs/toolkit/react";

export interface EventDialogState {
  open: boolean;
}

const initialState: EventDialogState = {
  open: false,
};

export const eventDialogSlice = createSlice({
  initialState,
  name: "eventDialog",
  reducers: (create) => ({
    closeEventDialog: create.reducer((state) => {
      state.open = false;
    }),
    openEventDialog: create.reducer((state) => {
      state.open = true;
    }),
  }),
  selectors: {
    selectEventDialogOpenState: (state) => state.open,
  },
});

export const { openEventDialog, closeEventDialog } = eventDialogSlice.actions;

export const { selectEventDialogOpenState } = eventDialogSlice.selectors;
