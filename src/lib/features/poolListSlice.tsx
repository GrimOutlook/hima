import { createSlice } from "@reduxjs/toolkit/react";
import type { PayloadAction } from "@reduxjs/toolkit";
import PPLPool from "../models/PPLPool";

export interface PoolListState {
    pools: PPLPool[];
}

const initialState: PoolListState = {
    pools: [],
}

export const poolListSlice = createSlice({
    name: "poolList",
    initialState,
    reducers: (create) => ({
        addPool: create.reducer((state, action: PayloadAction<PPLPool>) => {
            state.pools.push(action.payload);
        }),
        removePool: create.reducer((state, action: PayloadAction<string>) => {
            state.pools = state.pools.filter((pool: PPLPool) => action.payload != pool.name)
        })
    }),
    selectors: {
        selectPools: (state) => state.pools,
    },
});

export const { addPool, removePool } = poolListSlice.actions;

export const { selectPools } = poolListSlice.selectors;