import { createSlice } from "@reduxjs/toolkit/react";
import type { PayloadAction } from "@reduxjs/toolkit";
import { PPLPoolDto } from "../models/PPLPoolDto";

export interface PoolListState {
    pools: PPLPoolDto[];
}

const initialState: PoolListState = {
    pools: [],
}

export const poolListSlice = createSlice({
    name: "poolList",
    initialState,
    reducers: (create) => ({
        addPool: create.reducer((state, action: PayloadAction<PPLPoolDto>) => {
            state.pools.push(action.payload);
        }),
        removePool: create.reducer((state, action: PayloadAction<string>) => {
            state.pools = state.pools.filter((pool: PPLPoolDto) => action.payload != pool.name)
        })
    }),
    selectors: {
        selectPools: (state) => state.pools,
    },
});

export const { addPool, removePool } = poolListSlice.actions;

export const { selectPools } = poolListSlice.selectors;