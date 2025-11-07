import { PayloadAction, createSlice } from "@reduxjs/toolkit/react";
import {
  PoolFormDataDto,
  initialPoolFormDataDto,
} from "@/lib/models/PoolFormDto";

export interface PoolFormState {
  data: PoolFormDataDto;
  open: boolean;
}

const initialState: PoolFormState = {
  data: initialPoolFormDataDto,
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
    setPoolFormOpenState: create.reducer(
      (state, action: PayloadAction<boolean>) => {
        console.log("Setting pool form to " + (action.payload ? "open" : "closed"))
        state.open = action.payload;
      }
    ),
  }),
  selectors: {
    selectPoolFormData: (state) => state.data,
    selectPoolFormOpenState: (state) => state.open,
  },
});

export const { clearPoolFormData, setPoolFormData, setPoolFormOpenState } =
  poolFormSlice.actions;

export const { selectPoolFormData, selectPoolFormOpenState } =
  poolFormSlice.selectors;
