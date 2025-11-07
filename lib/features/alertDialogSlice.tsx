"use client";
import { PayloadAction, createSlice } from "@reduxjs/toolkit/react";

export interface AlertDialogState {
  open: boolean;
  title: string;
  message: string;
  timeout: number;
}

const initialState: AlertDialogState = {
  message: "",
  open: false,
  timeout: 0,
  title: "",
};

export const alertDialogSlice = createSlice({
  initialState,
  name: "alertDialog",
  reducers: (create) => ({
    closeAlertDialog: create.reducer((state) => {
      state.open = false;
    }),
    openAlertDialog: create.reducer(
      (
        state,
        action: PayloadAction<{
          timeout: number;
          title: string;
          message: string;
        }>
      ) => {
        state.title = action.payload.title;
        state.message = action.payload.message;
        state.timeout = action.payload.timeout;
        state.open = true;
      }
    ),
  }),
  selectors: {
    selectAlertDialogState: (state) => state,
  },
});

export const { openAlertDialog, closeAlertDialog } = alertDialogSlice.actions;

export const { selectAlertDialogState } = alertDialogSlice.selectors;
