"use client";
import {
  Action,
  ThunkAction,
  combineSlices,
  configureStore,
} from "@reduxjs/toolkit";
import {
  unsavedChangesListenerMiddleware,
  unsavedChangesSlice,
} from "./features/trackUnsavedChanges";
import { alertDialogSlice } from "./features/alertDialogSlice";
import { eventFormSlice } from "./features/eventFormSlice";
import { eventListSlice } from "./features/eventListSlice";
import { poolFormSlice } from "./features/poolFormSlice";
import { poolListSlice } from "./features/poolListSlice";
import { settingsMenuSlice } from "./features/settingsMenuSlice";

/*
 * `combineSlices` automatically combines the reducers using
 * their `reducerPath`s, therefore we no longer need to call `combineReducers`.
 */
const rootReducer = combineSlices(
  poolFormSlice,
  poolListSlice,
  eventFormSlice,
  eventListSlice,
  alertDialogSlice,
  unsavedChangesSlice,
  settingsMenuSlice
);
// Infer the `RootState` type from the root reducer
export type RootState = ReturnType<typeof rootReducer>;

/*
 *  `makeStore` encapsulates the store configuration to allow
 * creating unique store instances, which is particularly important for
 * server-side rendering (SSR) scenarios. In SSR, separate store instances
 * are needed for each request to prevent cross-request state pollution.
 */
export const makeStore = () =>
  configureStore({
    /*
     * Adding the api middleware enables caching, invalidation, polling,
     * and other useful features of `rtk-query`.
     */
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().prepend(
        unsavedChangesListenerMiddleware.middleware
      ),
    reducer: rootReducer,
  });

// Infer the return type of `makeStore`
export type AppStore = ReturnType<typeof makeStore>;
// Infer the `AppDispatch` type from the store itself
export type AppDispatch = AppStore["dispatch"];
export type AppThunk<ThunkReturnType = void> = ThunkAction<
  ThunkReturnType,
  RootState,
  unknown,
  Action
>;
