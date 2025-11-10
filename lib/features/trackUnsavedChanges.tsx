import {
  createListenerMiddleware,
  createSlice,
  isAnyOf,
  PayloadAction,
} from "@reduxjs/toolkit/react";

import { RootState } from "../store";
import { addEvent, removeEvent } from "./eventListSlice";
import { addPool, removePool } from "./poolListSlice";

export interface UnsavedChangesState {
  hasUnsavedChanges: boolean;
}

const initialState: UnsavedChangesState = {
  hasUnsavedChanges: false,
};

export const unsavedChangesSlice = createSlice({
  initialState,
  name: "dirty",
  reducers: (create) => ({
    setHasUnsavedChanges: create.reducer(
      (state, action: PayloadAction<boolean>) => {
        state.hasUnsavedChanges = action.payload;
      }
    ),
  }),
  selectors: {
    selectHasUnsavedChanges: (state) => state.hasUnsavedChanges,
  },
});

export const { setHasUnsavedChanges } = unsavedChangesSlice.actions;

export const { selectHasUnsavedChanges } = unsavedChangesSlice.selectors;

export const unsavedChangesListenerMiddleware = createListenerMiddleware();
unsavedChangesListenerMiddleware.startListening({
  effect: (action, listenerApi) => {
    const state = listenerApi.getState() as RootState;
    if (!state.dirty.hasUnsavedChanges) {
      // TODO: Add remote logging

      console.debug("Unsaved changes have been noted");
      listenerApi.dispatch(setHasUnsavedChanges(true));
    }
  },
  matcher: isAnyOf(addPool, removePool, addEvent, removeEvent),
});
