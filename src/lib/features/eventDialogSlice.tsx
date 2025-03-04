import { createSlice } from "@reduxjs/toolkit/react";

export interface EventDialogState {
    open: boolean;
}

const initialState: EventDialogState = {
    open: false,
}

export const eventDialogSlice = createSlice({
    name: "eventDialog",
    initialState,
    reducers: (create) => ({
        openEventDialog: create.reducer((state) => {
            state.open = true;
        }),
        closeEventDialog: create.reducer((state) => {
            state.open = false;
        })
    }),
    selectors: {
        selectEventDialogOpenState: (state) => state.open,
    },
});

export const { openEventDialog, closeEventDialog } = eventDialogSlice.actions;

export const { selectEventDialogOpenState } = eventDialogSlice.selectors;