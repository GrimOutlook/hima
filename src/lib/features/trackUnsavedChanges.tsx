import { createListenerMiddleware, createSlice, isAnyOf, PayloadAction } from "@reduxjs/toolkit/react";
import { addPool, removePool } from "./poolListSlice";
import { addEvent, removeEvent } from "./eventListSlice";
import { RootState } from "../store";

export interface UnsavedChangesState {
    hasUnsavedChanges: boolean;
}

const initialState: UnsavedChangesState = {
    hasUnsavedChanges: false,
}

export const unsavedChangesSlice = createSlice({
    name: "dirty",
    initialState,
    reducers: (create) => ({
        setHasUnsavedChanges: create.reducer((state, action: PayloadAction<boolean>) => {
            state.hasUnsavedChanges = action.payload;
        }),
    }),
    selectors: {
        selectHasUnsavedChanges: (state) => state.hasUnsavedChanges,
    },
});

export const { setHasUnsavedChanges } = unsavedChangesSlice.actions;

export const { selectHasUnsavedChanges } = unsavedChangesSlice.selectors;

export const unsavedChangesListenerMiddleware = createListenerMiddleware()
unsavedChangesListenerMiddleware.startListening({
    matcher: isAnyOf(addPool, removePool, addEvent, removeEvent),
    effect: async (action, listenerApi) => {
        const state = listenerApi.getState() as RootState
        if (!state.dirty.hasUnsavedChanges) {
            console.log("Unsaved changes have been noted")
            listenerApi.dispatch(setHasUnsavedChanges(true))
        }
    }
})