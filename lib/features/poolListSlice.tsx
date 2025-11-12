"use client";

import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit/react";

import { getNextId } from "@/lib/helpers";
import { LeavePoolDto, LeavePoolFormDto, leavePoolFormDtoWithId } from "@/lib/models/LeavePool";

import { debug_lists } from "../debug/debug";
import test_pools from "../debug/test_pools";

const pools = debug_lists == true ? test_pools : []

export interface PoolListState {
  pools: LeavePoolDto[];
}

const initialState: PoolListState = {
  pools: pools,
};

const nextPoolId = (state: PoolListState): number => {
  return getNextId(state.pools.map((pool) => pool.id))
}

export const poolListSlice = createSlice({
  initialState,
  name: "poolList",
  reducers: (create) => ({
    addPool: create.reducer((state, action: PayloadAction<LeavePoolFormDto>) => {
      state.pools.push(leavePoolFormDtoWithId(action.payload, nextPoolId(state)));
    }),
    removePool: create.reducer((state, action: PayloadAction<number>) => {
      state.pools = state.pools.filter(
        (pool: LeavePoolDto) => action.payload !== pool.id
      );
    }),
  }),
  selectors: {
    selectNextPoolID: (state) => nextPoolId(state),
    selectPools: (state) => state.pools,
  },
});

export const { addPool, removePool } = poolListSlice.actions;

export const { selectPools, selectNextPoolID } = poolListSlice.selectors;
