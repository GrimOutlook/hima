"use client";

import { PayloadAction, createSlice } from "@reduxjs/toolkit/react";
import {
  PoolFormDataDto,
  initialPoolFormDataDto,
} from "@/lib/models/PoolFormDto";

export interface PoolFormState {
  data: PoolFormDataDto;
  errors: number;
  open: boolean;
}

const initialState: PoolFormState = {
  data: initialPoolFormDataDto,
  errors: 0,
  open: false,
};

export const poolFormSlice = createSlice({
  initialState,
  name: "poolForm",
  reducers: (create) => ({
    clearPoolFormData: create.reducer((state) => {
      state.data = initialPoolFormDataDto;
    }),
    setPoolFormData: create.reducer(
      (state, action: PayloadAction<PoolFormDataDto>) => {
        state.data = action.payload;
      }
    ),
    setPoolFormErrors: create.reducer(
      (state, action: PayloadAction<number>) => {
        state.errors = action.payload;
      }
    ),
    setPoolFormOpenState: create.reducer(
      (state, action: PayloadAction<boolean>) => {
        state.open = action.payload;
      }
    ),
  }),
  selectors: {
    selectPoolFormData: (state) => state.data,
    selectPoolFormErrors: (state) => state.errors,
    selectPoolFormOpenState: (state) => state.open,
  },
});

export const {
  clearPoolFormData,
  setPoolFormData,
  setPoolFormErrors,
  setPoolFormOpenState,
} = poolFormSlice.actions;

export const {
  selectPoolFormData,
  selectPoolFormErrors,
  selectPoolFormOpenState,
} = poolFormSlice.selectors;
