'use client'
import { createSlice, PayloadAction } from "@reduxjs/toolkit/react";

export interface PoolDetailsOverlayState {
    open: boolean;
    pool_id?: number;
}

const initialState: PoolDetailsOverlayState = {
    open: false,
    pool_id: undefined
}

export const poolDetailsOverlaySlice = createSlice({
    name: "poolDetails",
    initialState,
    reducers: (create) => ({
        openPoolDetailsOverlay: create.reducer((state, action: PayloadAction<number>) => {
            state.open = true;
            state.pool_id = action.payload;
        }),
        closePoolDetailsOverlay: create.reducer((state) => {
            state.open = false;
            state.pool_id = undefined;
        })
    }),
    selectors: {
        selectPoolDetailsOverlayOpenState: (state) => state.open,
    },
});

export const { openPoolDetailsOverlay, closePoolDetailsOverlay } = poolDetailsOverlaySlice.actions;

export const { selectPoolDetailsOverlayOpenState } = poolDetailsOverlaySlice.selectors;