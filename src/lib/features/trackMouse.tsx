'use client'
import { createSlice, PayloadAction } from "@reduxjs/toolkit/react";
import { useEffect } from "react";
import { useAppDispatch } from "../hooks";

export interface TrackMouseState {
    position: {
        x: number;
        y: number;
    }
}

const initialState: TrackMouseState = {
    position: {x: 0, y: 0}
}

export const trackMouseSlice = createSlice({
    name: "trackMouse",
    initialState,
    reducers: (create) => ({
        setMousePosition: create.reducer((state, action: PayloadAction<{x: number, y: number}>) => {
            state.position.x = action.payload.x
            state.position.y = action.payload.y
        }),
    }),
    selectors: {
        selectMousePosition: (state) => state.position,
    },
});

export const { setMousePosition } = trackMouseSlice.actions;

export const { selectMousePosition } = trackMouseSlice.selectors;
