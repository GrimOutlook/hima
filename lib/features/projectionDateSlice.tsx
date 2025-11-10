"use client";
import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit/react";
import dayjs from "dayjs";

export interface ProjectionDateState {
  date: number;
}

const initialState: ProjectionDateState = {
  date: dayjs().toDate().getTime(),
};

export const projectionsDateSlice = createSlice({
  initialState,
  name: "projectionsDate",
  reducers: (create) => ({
    setProjectionDate: create.reducer((state, action: PayloadAction<number>) => {
      state.date = action.payload;
    }),
  }),
  selectors: {
    selectProjectionDate: (state) => state.date,
  },
});

export const { setProjectionDate } =
  projectionsDateSlice.actions;

export const { selectProjectionDate } = projectionsDateSlice.selectors;
