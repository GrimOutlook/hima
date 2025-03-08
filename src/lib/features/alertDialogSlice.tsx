'use client'
import { createSlice, PayloadAction } from "@reduxjs/toolkit/react";

export interface AlertDialogState {
    open: boolean;
    title: string;
    message: string;
    timeout: number;
}

const initialState: AlertDialogState = {
    open: false,
    title: "",
    message: "",
    timeout: 0,
}

export const alertDialogSlice = createSlice({
    name: "alertDialog",
    initialState,
    reducers: (create) => ({
        openAlertDialog: create.reducer((state, action: PayloadAction<{timeout: number, title: string, message: string}>) => {
            state.title = action.payload.title;
            state.message = action.payload.message;
            state.timeout = action.payload.timeout;
            state.open = true;
        }),
        closeAlertDialog: create.reducer((state) => {
            state.open = false;
        })
    }),
    selectors: {
        selectAlertDialogState: (state) => state,
    },
});

export const { openAlertDialog, closeAlertDialog } = alertDialogSlice.actions;

export const { selectAlertDialogState } = alertDialogSlice.selectors;