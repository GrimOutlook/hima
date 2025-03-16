"use client";

import {
  EventFormDataDto,
  initialEventFormDataDto,
} from "@/lib/models/EventFormDto";
import { PayloadAction, createSlice } from "@reduxjs/toolkit/react";

export interface EventFormState {
  data: EventFormDataDto;
  errors: number;
  open: boolean;
}

const initialState: EventFormState = {
  data: initialEventFormDataDto,
  errors: 0,
  open: false,
};

export const eventFormSlice = createSlice({
  initialState,
  name: "eventForm",
  reducers: (create) => ({
    clearEventFormData: create.reducer((state) => {
      state.data = initialEventFormDataDto;
      state.errors = 0;
    }),
    setEventFormData: create.reducer(
      (state, action: PayloadAction<EventFormDataDto>) => {
        state.data = action.payload;
      }
    ),
    setEventFormErrors: create.reducer(
      (state, action: PayloadAction<number>) => {
        state.errors = action.payload;
      }
    ),
    setEventFormOpenState: create.reducer(
      (state, action: PayloadAction<boolean>) => {
        state.open = action.payload;
      }
    ),
  }),
  selectors: {
    selectEventFormData: (state) => state.data,
    selectEventFormErrors: (state) => state.errors,
    selectEventFormOpenState: (state) => state.open,
  },
});

export const {
  clearEventFormData,
  setEventFormData,
  setEventFormErrors,
  setEventFormOpenState,
} = eventFormSlice.actions;

export const {
  selectEventFormData,
  selectEventFormErrors,
  selectEventFormOpenState,
} = eventFormSlice.selectors;
