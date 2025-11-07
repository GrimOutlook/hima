"use client";

import {
  EventFormDataDto,
  initialEventFormDataDto,
} from "@/lib/models/EventFormDto";
import { PayloadAction, createSlice } from "@reduxjs/toolkit/react";

export interface EventFormState {
  data: EventFormDataDto;
  open: boolean;
}

const initialState: EventFormState = {
  data: initialEventFormDataDto,
  open: false,
};

export const eventFormSlice = createSlice({
  initialState,
  name: "eventForm",
  reducers: (create) => ({
    clearEventFormData: create.reducer((state) => {
      state.data = initialEventFormDataDto;
    }),
    setEventFormData: create.reducer(
      (state, action: PayloadAction<EventFormDataDto>) => {
        state.data = action.payload;
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
    selectEventFormOpenState: (state) => state.open,
  },
});

export const {
  clearEventFormData,
  setEventFormData,
  setEventFormOpenState,
} = eventFormSlice.actions;

export const {
  selectEventFormData,
  selectEventFormOpenState,
} = eventFormSlice.selectors;
