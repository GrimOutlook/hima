"use client";

import { LeavePoolDto } from "@/lib/models/LeavePool";
import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit/react";
import { getNextId } from "@/lib/helpers";

export interface PoolListState {
    pools: LeavePoolDto[];
}

const initialState: PoolListState = {
    pools: [],
};

export const poolListSlice = createSlice({
    initialState,
    name: "poolList",
    reducers: (create) => ({
        addPool: create.reducer((state, action: PayloadAction<LeavePoolDto>) => {
            state.pools.push(action.payload);
        }),
        removePool: create.reducer((state, action: PayloadAction<number>) => {
            state.pools = state.pools.filter(
                (pool: LeavePoolDto) => action.payload !== pool.id
            );
        }),
    }),
    selectors: {
        selectNextPoolID: (state) => getNextId(state.pools.map((pool) => pool.id)),
        selectPools: (state) => state.pools,
    },
});

export const { addPool, removePool } = poolListSlice.actions;

export const { selectPools, selectNextPoolID } = poolListSlice.selectors;
