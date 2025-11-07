"use client";
import { createSlice } from "@reduxjs/toolkit/react";

export interface SettingsMenuState {
  open: boolean;
}

const initialState: SettingsMenuState = {
  open: false,
};

export const settingsMenuSlice = createSlice({
  initialState,
  name: "settingsMenu",
  reducers: (create) => ({
    closeSettingsMenu: create.reducer((state) => {
      state.open = false;
    }),
    openSettingsMenu: create.reducer((state) => {
      state.open = true;
    }),
  }),
  selectors: {
    selectSettingsMenuOpenState: (state) => state.open,
  },
});

export const { openSettingsMenu, closeSettingsMenu } =
  settingsMenuSlice.actions;

export const { selectSettingsMenuOpenState } = settingsMenuSlice.selectors;
