'use client'
import { createSlice } from "@reduxjs/toolkit/react";
import type { PayloadAction } from "@reduxjs/toolkit";
import { PPLPoolDto } from "../models/PPLPoolDto";
import { randomInt } from "../helpers";

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
            console.log(`Adding pool with ID ${action.payload.id}`)
            state.pools.push(action.payload);
        }),
        removePool: create.reducer((state, action: PayloadAction<number>) => {
            state.pools = state.pools.filter((pool: PPLPoolDto) => action.payload != pool.id)
        })
    }),
    selectors: {
        selectPools: (state) => state.pools,
        selectNextPoolID: (state) => {
            let next_id = 0
            do {
                next_id = randomInt(0, (2**48)-1)
            } while ( state.pools.some((pool) => pool.id == next_id) )
            return next_id
        },
    },
});

export const { addPool, removePool } = poolListSlice.actions;

export const { selectPools, selectNextPoolID } = poolListSlice.selectors;