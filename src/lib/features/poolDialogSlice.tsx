'use client'
import { createSlice } from "@reduxjs/toolkit/react";

export interface PoolDialogState {
    open: boolean;
}

const initialState: PoolDialogState = {
    open: false,
}

export const poolDialogSlice = createSlice({
    name: "poolDialog",
    initialState,
    reducers: (create) => ({
        openPoolDialog: create.reducer((state) => {
            state.open = true;
        }),
        closePoolDialog: create.reducer((state) => {
            state.open = false;
        })
    }),
    selectors: {
        selectPoolDialogOpenState: (state) => state.open,
    },
});

export const { openPoolDialog, closePoolDialog } = poolDialogSlice.actions;

export const { selectPoolDialogOpenState } = poolDialogSlice.selectors;